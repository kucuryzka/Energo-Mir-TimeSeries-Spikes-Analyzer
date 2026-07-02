using System;
using System.Collections.Generic;
using System.Data.Common;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using API.Services;
using API.DTOs;
using Core.Enums;
using Core.Models;
using Dapper;
using Core.Interfaces;
using Microsoft.Data.SqlClient;
using Npgsql;
using Microsoft.EntityFrameworkCore;
using API.Data;
using Hangfire;
using API.Models;
using System.Text.Json;

namespace API.Controllers;

public class GenericAnalysisRequest
{
    public string Database { get; set; } = string.Empty;
    public string Schema { get; set; } = string.Empty;
    public string Table { get; set; } = string.Empty;
    public string TimeColumn { get; set; } = string.Empty;
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public TimeGranularity Granularity { get; set; } = TimeGranularity.Hour;
    public int? CustomMinutes { get; set; }
    public double? Confidence { get; set; }
    public int? WindowSize { get; set; }
}

public class GenericDataPoint
{
    public DateTime Timestamp { get; set; }
    public long Value { get; set; }
}

[ApiController]
[Route("api/[controller]")]
public class GenericAnalysisController : ControllerBase
{
    private readonly IConnectionManagerService _connectionManager;
    private readonly InternalDbContext _internalDb;
    private readonly IBackgroundJobClient _backgroundJobClient;

    public GenericAnalysisController(
        IConnectionManagerService connectionManager,
        InternalDbContext internalDb,
        IBackgroundJobClient backgroundJobClient)
    {
        _connectionManager = connectionManager;
        _internalDb = internalDb;
        _backgroundJobClient = backgroundJobClient;
    }

    [HttpGet("time-range")]
    public async Task<IActionResult> GetTimeRange([FromQuery] string database, [FromQuery] string schema, [FromQuery] string table, [FromQuery] string timeColumn)
    {
        try
        {
            var token = Request.Headers["X-Session-Token"].ToString();
            var info = _connectionManager.GetConnectionInfo(token ?? "");
            if (info == null) return Unauthorized("Invalid or missing session token");

            var connStrBuilder = new DbConnectionStringBuilder { ConnectionString = info.ConnectionString };
            connStrBuilder["Database"] = database;
            var targetConnStr = connStrBuilder.ConnectionString;

            using var connection = info.Provider == "pgsql" 
                ? (DbConnection)new NpgsqlConnection(targetConnStr) 
                : new SqlConnection(targetConnStr);
            
            await connection.OpenAsync();

            var schemaSafe = info.Provider == "pgsql" ? $"\"{schema}\"" : $"[{schema}]";
            var tableSafe = info.Provider == "pgsql" ? $"\"{table}\"" : $"[{table}]";
            var timeColSafe = info.Provider == "pgsql" ? $"\"{timeColumn}\"" : $"[{timeColumn}]";

            var sql = $"SELECT MIN({timeColSafe}) as MinDate, MAX({timeColSafe}) as MaxDate FROM {schemaSafe}.{tableSafe}";
            var result = await connection.QueryFirstOrDefaultAsync(sql);
            
            return Ok(result);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Error fetching time range", details = ex.Message });
        }
    }

    [HttpPost("enqueue")]
    public async Task<IActionResult> EnqueueAnalysis([FromBody] GenericAnalysisRequest request)
    {
        try
        {
            var token = Request.Headers["X-Session-Token"].ToString();
            var info = _connectionManager.GetConnectionInfo(token ?? "");
            if (info == null) return Unauthorized("Invalid or missing session token");

            var job = new AnalysisJob
            {
                Database = request.Database,
                Schema = request.Schema,
                Table = request.Table,
                TimeColumn = request.TimeColumn,
                StartDate = request.StartDate,
                EndDate = request.EndDate,
                Granularity = request.Granularity,
                CustomMinutes = request.CustomMinutes,
                Confidence = request.Confidence,
                WindowSize = request.WindowSize
            };

            _internalDb.AnalysisJobs.Add(job);
            await _internalDb.SaveChangesAsync();

            var jobId = _backgroundJobClient.Enqueue<API.Services.AnalysisJobProcessor>(p => p.ProcessJobAsync(job.Id, info.Provider, info.ConnectionString));
            
            job.BackgroundJobId = jobId;
            await _internalDb.SaveChangesAsync();

            return Ok(new { JobId = job.Id });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Error enqueueing analysis", details = ex.Message });
        }
    }

    [HttpGet("status/{id}")]
    public async Task<IActionResult> GetJobStatus(string id)
    {
        var job = await _internalDb.AnalysisJobs.FindAsync(id);
        if (job == null) return NotFound();

        return Ok(new { 
            job.Id, 
            job.Status, 
            job.Progress, 
            job.ErrorMessage,
            HasResult = job.ResultJson != null 
        });
    }

    [HttpGet("result/{id}")]
    public async Task<IActionResult> GetJobResult(string id)
    {
        var job = await _internalDb.AnalysisJobs.FindAsync(id);
        if (job == null) return NotFound();
        if (string.IsNullOrEmpty(job.ResultJson)) return BadRequest("Result is not ready or failed");

        return Content(job.ResultJson, "application/json");
    }

    [HttpGet("history")]
    public async Task<IActionResult> GetHistory([FromQuery] string database, [FromQuery] string schema, [FromQuery] string table)
    {
        var history = await _internalDb.AnalysisJobs
            .Where(j => j.Database == database && j.Schema == schema && j.Table == table)
            .OrderByDescending(j => j.CreatedAt)
            .Select(j => new {
                j.Id,
                j.StartDate,
                j.EndDate,
                j.Granularity,
                j.Status,
                j.Progress,
                j.CreatedAt
            })
            .ToListAsync();

        return Ok(history);
    }

    [HttpDelete("history/{id}")]
    public async Task<IActionResult> DeleteHistoryItem(string id)
    {
        var job = await _internalDb.AnalysisJobs.FindAsync(id);
        if (job == null) return NotFound();

        if (!string.IsNullOrEmpty(job.BackgroundJobId))
        {
            _backgroundJobClient.Delete(job.BackgroundJobId);
        }

        _internalDb.AnalysisJobs.Remove(job);
        await _internalDb.SaveChangesAsync();

        return NoContent();
    }

    [HttpPost("analyze")]
    public async Task<IActionResult> Analyze([FromBody] GenericAnalysisRequest request, [FromServices] ISpikeDetectionService spikeDetectionService)
    {
        try
        {
            var token = Request.Headers["X-Session-Token"].ToString();
            var info = _connectionManager.GetConnectionInfo(token ?? "");
            if (info == null) return Unauthorized("Invalid or missing session token");

            var connStrBuilder = new DbConnectionStringBuilder { ConnectionString = info.ConnectionString };
            connStrBuilder["Database"] = request.Database;
            var targetConnStr = connStrBuilder.ConnectionString;

            var optionsBuilder = new DbContextOptionsBuilder<AppDbContext>();
            if (info.Provider == "pgsql") optionsBuilder.UseNpgsql(targetConnStr, opts => opts.CommandTimeout(3600));
            else optionsBuilder.UseSqlServer(targetConnStr, opts => opts.CommandTimeout(3600));

            using var _context = new AppDbContext(optionsBuilder.Options);
            _context.Database.SetCommandTimeout(3600);

            string dateAddExpr;
            if (info.Provider == "pgsql")
            {
                dateAddExpr = request.Granularity switch
                {
                    TimeGranularity.Minute => $"date_trunc('minute', \"{request.TimeColumn}\")",
                    TimeGranularity.Hour => $"date_trunc('hour', \"{request.TimeColumn}\")",
                    TimeGranularity.Day => $"date_trunc('day', \"{request.TimeColumn}\")",
                    TimeGranularity.Week => $"date_trunc('week', \"{request.TimeColumn}\")",
                    TimeGranularity.Month => $"date_trunc('month', \"{request.TimeColumn}\")",
                    TimeGranularity.Custom => $"to_timestamp(floor((extract('epoch' from \"{request.TimeColumn}\") / {(request.CustomMinutes ?? 60) * 60 })) * {(request.CustomMinutes ?? 60) * 60})",
                    _ => $"date_trunc('hour', \"{request.TimeColumn}\")"
                };
            }
            else
            {
                dateAddExpr = request.Granularity switch
                {
                    TimeGranularity.Minute => $"DATEADD(minute, DATEDIFF(minute, 0, [{request.TimeColumn}]), 0)",
                    TimeGranularity.Hour => $"DATEADD(hour, DATEDIFF(hour, 0, [{request.TimeColumn}]), 0)",
                    TimeGranularity.Day => $"DATEADD(day, DATEDIFF(day, 0, [{request.TimeColumn}]), 0)",
                    TimeGranularity.Week => $"DATEADD(week, DATEDIFF(week, 0, [{request.TimeColumn}]), 0)",
                    TimeGranularity.Month => $"DATEADD(month, DATEDIFF(month, 0, [{request.TimeColumn}]), 0)",
                    TimeGranularity.Custom => $"DATEADD(minute, (DATEDIFF(minute, 0, [{request.TimeColumn}]) / {(request.CustomMinutes ?? 60)}) * {(request.CustomMinutes ?? 60)}, 0)",
                    _ => $"DATEADD(hour, DATEDIFF(hour, 0, [{request.TimeColumn}]), 0)"
                };
            }

            var schemaSafe = info.Provider == "pgsql" ? $"\"{request.Schema}\"" : $"[{request.Schema}]";
            var tableSafe = info.Provider == "pgsql" ? $"\"{request.Table}\"" : $"[{request.Table}]";
            var timeColSafe = info.Provider == "pgsql" ? $"\"{request.TimeColumn}\"" : $"[{request.TimeColumn}]";

            var sqlAggregate = $@"
                SELECT 
                    {dateAddExpr} as Timestamp,
                    COUNT(*) as Value,
                    0 as ChannelId
                FROM {schemaSafe}.{tableSafe}
                WHERE {timeColSafe} >= @p0 AND {timeColSafe} < @p1
                GROUP BY {dateAddExpr}
                ORDER BY Timestamp";

            var groupedSeriesDict = new Dictionary<DateTime, DataPoint>();
            var currentStart = request.StartDate;

            while (currentStart < request.EndDate)
            {
                var currentEnd = currentStart.AddMonths(1);
                if (currentEnd > request.EndDate) currentEnd = request.EndDate;

                var parameters = new List<object> { currentStart, currentEnd };
                var batchAggregates = await _context.Database
                    .SqlQueryRaw<AggregatedResult>(sqlAggregate, parameters.ToArray())
                    .ToListAsync();

                foreach (var a in batchAggregates)
                {
                    if (groupedSeriesDict.TryGetValue(a.Timestamp, out var existing))
                    {
                        existing.Value += a.Value;
                    }
                    else
                    {
                        groupedSeriesDict[a.Timestamp] = new DataPoint { Timestamp = a.Timestamp, Value = a.Value, ChannelBreakdown = new Dictionary<int, int>() };
                    }
                }
                currentStart = currentEnd;
            }

            var groupedSeries = groupedSeriesDict.Values.OrderBy(p => p.Timestamp).ToList();

            var anomalyResults = spikeDetectionService.DetectSpikes(
                groupedSeries,
                request.Confidence ?? 95,
                request.WindowSize ?? 30);

            return Ok(anomalyResults.Select(r => new AnomalyResultDto
            {
                Timestamp = r.Timestamp,
                Value = r.Value,
                IsSpike = r.IsSpike,
                PValue = r.PValue,
                ChannelBreakdown = new List<ChannelContributionDto>() // No channel breakdown in generic for now
            }));
        }
        catch (Exception ex)
        {
            Console.WriteLine("=== ERROR IN GENERIC ANALYZE ===");
            Console.WriteLine(ex.ToString());
            return StatusCode(500, new { message = "An error occurred during generic analysis.", details = ex.Message });
        }
    }

    [HttpGet("point-details")]
    public async Task<IActionResult> GetPointDetails([FromQuery] string database, [FromQuery] string schema, [FromQuery] string table, [FromQuery] string timeColumn, [FromQuery] DateTime timestamp, [FromQuery] TimeGranularity granularity, [FromQuery] int? customMinutes)
    {
        try
        {
            var token = Request.Headers["X-Session-Token"].ToString();
            var info = _connectionManager.GetConnectionInfo(token ?? "");
            if (info == null) return Unauthorized("Invalid or missing session token");

            var connStrBuilder = new DbConnectionStringBuilder { ConnectionString = info.ConnectionString };
            connStrBuilder["Database"] = database;
            var targetConnStr = connStrBuilder.ConnectionString;

            using var connection = info.Provider == "pgsql" 
                ? (DbConnection)new NpgsqlConnection(targetConnStr) 
                : new SqlConnection(targetConnStr);
            
            await connection.OpenAsync();

            var endDate = granularity switch
            {
                TimeGranularity.Minute => timestamp.AddMinutes(1),
                TimeGranularity.Hour => timestamp.AddHours(1),
                TimeGranularity.Day => timestamp.AddDays(1),
                TimeGranularity.Week => timestamp.AddDays(7),
                TimeGranularity.Month => timestamp.AddMonths(1),
                TimeGranularity.Custom => timestamp.AddMinutes(customMinutes ?? 60),
                _ => timestamp.AddHours(1)
            };

            var schemaSafe = info.Provider == "pgsql" ? $"\"{schema}\"" : $"[{schema}]";
            var tableSafe = info.Provider == "pgsql" ? $"\"{table}\"" : $"[{table}]";
            var timeColSafe = info.Provider == "pgsql" ? $"\"{timeColumn}\"" : $"[{timeColumn}]";

            // We select TOP 1000 or LIMIT 1000 to prevent massive loads
            var limitClause = info.Provider == "pgsql" ? "LIMIT 1000" : "TOP 1000";
            var sql = info.Provider == "pgsql"
                ? $"SELECT * FROM {schemaSafe}.{tableSafe} WHERE {timeColSafe} >= @Start AND {timeColSafe} < @End {limitClause}"
                : $"SELECT {limitClause} * FROM {schemaSafe}.{tableSafe} WHERE {timeColSafe} >= @Start AND {timeColSafe} < @End";

            var result = await connection.QueryAsync(sql, new { Start = timestamp, End = endDate });
            return Ok(result);
        }
        catch (Exception ex)
        {
            Console.WriteLine("=== ERROR IN GENERIC POINT DETAILS ===");
            Console.WriteLine(ex.ToString());
            return StatusCode(500, new { message = "An error occurred fetching point details.", details = ex.Message });
        }
    }
}
