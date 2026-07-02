using System;
using System.Collections.Generic;
using System.Data.Common;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using API.Data;
using API.Models;
using Core.Enums;
using Core.Models;
using Core.Interfaces;
using Dapper;
using Microsoft.Data.SqlClient;
using Npgsql;
using System.Text.Json;
using API.DataSources;

namespace API.Services;

public class AnalysisJobProcessor
{
    private readonly InternalDbContext _internalDb;
    private readonly ISpikeDetectionService _spikeDetectionService;
    private readonly IEnumerable<IDataSourceStrategy> _dataSourceStrategies;

    public AnalysisJobProcessor(
        InternalDbContext internalDb, 
        ISpikeDetectionService spikeDetectionService,
        IEnumerable<IDataSourceStrategy> dataSourceStrategies)
    {
        _internalDb = internalDb;
        _spikeDetectionService = spikeDetectionService;
        _dataSourceStrategies = dataSourceStrategies;
    }

    public async Task ProcessJobAsync(string jobId, string provider, string connectionString)
    {
        var job = await _internalDb.AnalysisJobs.FindAsync(jobId);
        if (job == null) return;

        try
        {
            job.Status = "Running";
            job.Progress = 0;
            await _internalDb.SaveChangesAsync();

            var connStrBuilder = new DbConnectionStringBuilder { ConnectionString = connectionString };
            connStrBuilder["Database"] = job.Database;
            var targetConnStr = connStrBuilder.ConnectionString;

            var optionsBuilder = new DbContextOptionsBuilder<AppDbContext>();
            if (provider == "pgsql") optionsBuilder.UseNpgsql(targetConnStr, opts => opts.CommandTimeout(3600));
            else optionsBuilder.UseSqlServer(targetConnStr, opts => opts.CommandTimeout(3600));

            using var _context = new AppDbContext(optionsBuilder.Options);
            _context.Database.SetCommandTimeout(3600);

            string dateAddExpr;
            if (provider == "pgsql")
            {
                dateAddExpr = job.Granularity switch
                {
                    TimeGranularity.Minute => $"date_trunc('minute', \"{job.TimeColumn}\")",
                    TimeGranularity.Hour => $"date_trunc('hour', \"{job.TimeColumn}\")",
                    TimeGranularity.Day => $"date_trunc('day', \"{job.TimeColumn}\")",
                    TimeGranularity.Week => $"date_trunc('week', \"{job.TimeColumn}\")",
                    TimeGranularity.Month => $"date_trunc('month', \"{job.TimeColumn}\")",
                    TimeGranularity.Custom => $"to_timestamp(floor((extract('epoch' from \"{job.TimeColumn}\") / {(job.CustomMinutes ?? 60) * 60 })) * {(job.CustomMinutes ?? 60) * 60})",
                    _ => $"date_trunc('hour', \"{job.TimeColumn}\")"
                };
            }
            else
            {
                dateAddExpr = job.Granularity switch
                {
                    TimeGranularity.Minute => $"DATEADD(minute, DATEDIFF(minute, 0, [{job.TimeColumn}]), 0)",
                    TimeGranularity.Hour => $"DATEADD(hour, DATEDIFF(hour, 0, [{job.TimeColumn}]), 0)",
                    TimeGranularity.Day => $"DATEADD(day, DATEDIFF(day, 0, [{job.TimeColumn}]), 0)",
                    TimeGranularity.Week => $"DATEADD(week, DATEDIFF(week, 0, [{job.TimeColumn}]), 0)",
                    TimeGranularity.Month => $"DATEADD(month, DATEDIFF(month, 0, [{job.TimeColumn}]), 0)",
                    TimeGranularity.Custom => $"DATEADD(minute, (DATEDIFF(minute, 0, [{job.TimeColumn}]) / {(job.CustomMinutes ?? 60)}) * {(job.CustomMinutes ?? 60)}, 0)",
                    _ => $"DATEADD(hour, DATEDIFF(hour, 0, [{job.TimeColumn}]), 0)"
                };
            }

            var schemaSafe = provider == "pgsql" ? $"\"{job.Schema}\"" : $"[{job.Schema}]";
            var tableSafe = provider == "pgsql" ? $"\"{job.Table}\"" : $"[{job.Table}]";
            var timeColSafe = provider == "pgsql" ? $"\"{job.TimeColumn}\"" : $"[{job.TimeColumn}]";

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
            var currentStart = job.StartDate;
            
            double totalMonths = (job.EndDate - job.StartDate).TotalDays / 30.0;
            if (totalMonths <= 0) totalMonths = 1;
            int monthsProcessed = 0;

            while (currentStart < job.EndDate)
            {
                var currentEnd = currentStart.AddMonths(1);
                if (currentEnd > job.EndDate) currentEnd = job.EndDate;

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
                
                monthsProcessed++;
                job.Progress = (int)((monthsProcessed / totalMonths) * 90); // 90% is DB fetching
                await _internalDb.SaveChangesAsync();

                currentStart = currentEnd;
            }

            var groupedSeries = groupedSeriesDict.Values.OrderBy(p => p.Timestamp).ToList();

            var anomalyResults = _spikeDetectionService.DetectSpikes(
                groupedSeries,
                job.Confidence ?? 95,
                job.WindowSize ?? 30);
                
            var lightweightResult = anomalyResults.Select(r => new 
            {
                Timestamp = r.Timestamp,
                Value = r.Value,
                IsSpike = r.IsSpike,
                PValue = r.PValue
            }).ToList();

            var options = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
            job.ResultJson = JsonSerializer.Serialize(lightweightResult, options);
            job.Status = "Completed";
            job.Progress = 100;
            job.CompletedAt = DateTime.UtcNow;
            await _internalDb.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            job.Status = "Failed";
            job.ErrorMessage = ex.Message;
            await _internalDb.SaveChangesAsync();
            throw; // Re-throw for Hangfire to handle retries
        }
    }
    public async Task ProcessLegacyJobAsync(string jobId, string sourceId, string provider, string connectionString)
    {
        var job = await _internalDb.AnalysisJobs.FindAsync(jobId);
        if (job == null) return;

        try
        {
            job.Status = "Running";
            job.Progress = 50; // Cannot easily track progress for single large EF queries
            await _internalDb.SaveChangesAsync();

            var dataSource = _dataSourceStrategies.FirstOrDefault(d => d.Id.Equals(sourceId, StringComparison.OrdinalIgnoreCase));
            if (dataSource == null) throw new Exception($"DataSource {sourceId} not found");

            int? channelId = null;
            if (!string.IsNullOrEmpty(job.Table) && int.TryParse(job.Table, out var cid))
            {
                channelId = cid;
            }

            var request = new API.DTOs.DetectSpikesRequest
            {
                Database = job.Database,
                SourceId = sourceId,
                ChannelId = channelId,
                Granularity = job.Granularity,
                CustomMinutes = job.CustomMinutes,
                Confidence = job.Confidence ?? 95.0,
                WindowSize = job.WindowSize ?? 30,
                StartDate = job.StartDate,
                EndDate = job.EndDate
            };

            var progress = new SyncProgress(percent => 
            {
                job.Progress = percent;
                job.Status = "Running";
                _internalDb.SaveChanges();
            });

            var response = await dataSource.ExecuteAnalysisAsync(request, _spikeDetectionService, connectionString, provider, progress);

            var options = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
            job.ResultJson = JsonSerializer.Serialize(response, options);
            job.Status = "Completed";
            job.Progress = 100;
            job.CompletedAt = DateTime.UtcNow;
            await _internalDb.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            job.Status = "Failed";
            job.ErrorMessage = ex.Message;
            await _internalDb.SaveChangesAsync();
            throw; // Re-throw for Hangfire
        }
    }

    private class SyncProgress : IProgress<int>
    {
        private readonly Action<int> _action;
        public SyncProgress(Action<int> action) => _action = action;
        public void Report(int value) => _action(value);
    }
}
