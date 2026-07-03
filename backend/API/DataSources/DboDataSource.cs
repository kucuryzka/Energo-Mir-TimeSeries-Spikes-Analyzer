using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using API.DTOs;
using Core.Enums;
using Core.Models;
using Core.Interfaces;

namespace API.DataSources;

public class DboDataSource : IDataSourceStrategy
{
    private readonly DbContext _context;
    private readonly ISqlDialect _sql;
    private readonly string _id;
    private readonly string _name;

    public DboDataSource(DbContext context, ISqlDialect sql, string id, string name)
    {
        _context = context;
        _sql = sql;
        _id = id;
        _name = name;
    }

    public string Id => _id;
    public string Name => _name;
    public DataSourceKind Kind => DataSourceKind.Dbo;
    public DatabaseProvider Provider => _sql.Provider;
    public string[] SupportedDistributions => Array.Empty<string>();

    public async Task<SpikeResponse> ExecuteAnalysisAsync(DetectSpikesRequest request, ISpikeDetectionService spikeDetectionService)
    {
        var meterings = _sql.QualifyTable("dbo", "METERINGS");
        var dateAddExpr = _sql.GetTimeBucketExpression("m.TIME_INSERT", request.Granularity, request.CustomMinutes);

        var sqlAggregate = $@"
            SELECT 
                {dateAddExpr} as Timestamp,
                COUNT(*) as Value,
                m.IDOBJECT as ChannelId
            FROM {meterings} m
            WHERE m.TIME_INSERT >= @p0 AND m.TIME_INSERT < @p1
            {(request.ChannelId.HasValue ? "AND m.IDOBJECT = @p2" : "")}
            GROUP BY {dateAddExpr}, m.IDOBJECT
            ORDER BY Timestamp";

        var rawAggregates = new List<AggregatedResult>();
        var currentStart = request.StartDate;

        while (currentStart < request.EndDate)
        {
            var currentEnd = currentStart.AddDays(1);
            if (currentEnd > request.EndDate) currentEnd = request.EndDate;

            var parameters = new List<object> { currentStart, currentEnd };
            if (request.ChannelId.HasValue) parameters.Add(request.ChannelId.Value);

            var batchAggregates = await _context.Database
                .SqlQueryRaw<AggregatedResult>(sqlAggregate, parameters.ToArray())
                .ToListAsync();

            rawAggregates.AddRange(batchAggregates);

            currentStart = currentEnd;
        }

        var groupedSeries = rawAggregates
            .GroupBy(a => a.Timestamp)
            .Select(g => new DataPoint
            {
                Timestamp = g.Key,
                Value = g.Sum(x => x.Value),
                ChannelBreakdown = g.Where(x => x.ChannelId != 0).GroupBy(x => x.ChannelId).ToDictionary(x => x.Key, x => x.Sum(y => y.Value))
            })
            .OrderBy(p => p.Timestamp)
            .ToList();

        var anomalyResults = spikeDetectionService.DetectSpikes(
            groupedSeries,
            request.Confidence,
            request.WindowSize);

        var channelIds = anomalyResults
            .SelectMany(r => r.ChannelBreakdown.Keys)
            .Distinct()
            .ToList();

        var channelNames = new Dictionary<int, string>();
        if (channelIds.Any())
        {
            var objects = _sql.QualifyTable("dbo", "OBJECTS");
            var chunkSize = 1000;
            for (int i = 0; i < channelIds.Count; i += chunkSize)
            {
                var chunk = channelIds.Skip(i).Take(chunkSize);
                var idsString = string.Join(",", chunk);
                var sql = $@"
                    SELECT IDOBJECT as Id, OBJECT_NAME as Name, NULL as EventCode 
                    FROM {objects} 
                    WHERE IDOBJECT IN ({idsString})";
                
                var dbChannels = await _context.Database.SqlQueryRaw<ChannelDto>(sql).ToListAsync();
                foreach (var c in dbChannels)
                {
                    channelNames[c.Id] = c.Name;
                }
            }
        }

        return new SpikeResponse
        {
            Series = anomalyResults.Select(r => new AnomalyResultDto
            {
                Timestamp = r.Timestamp,
                Value = r.Value,
                IsSpike = r.IsSpike,
                PValue = r.PValue,
                ChannelBreakdown = r.ChannelBreakdown.Select(cb => new ChannelContributionDto
                {
                    ChannelId = cb.Key,
                    ChannelName = channelNames.TryGetValue(cb.Key, out var name) ? name : $"Объект {cb.Key}",
                    Count = cb.Value
                }).ToList()
            }).ToList()
        };
    }

    public async Task<List<ObjectDto>> GetObjectsAsync(string? search, int page = 1, int pageSize = 50)
    {
        var objects = _sql.QualifyTable("dbo", "OBJECTS");
        var query = _context.Database.SqlQueryRaw<ObjectDto>(
            $"SELECT IDOBJECT as Id, OBJECT_NAME as Name FROM {objects}"
        );
        
        var list = await query.ToListAsync();
        
        if (!string.IsNullOrEmpty(search))
        {
            var searchLower = search.ToLower();
            list = list.Where(c => c.Name.ToLower().Contains(searchLower)).ToList();
        }

        return list.Skip((page - 1) * pageSize).Take(pageSize).ToList();
    }

    public async Task<List<MeteringInfoDto>> GetPointDetailsAsync(DateTime timestamp, TimeGranularity granularity, int? customMinutes, int? channelId)
    {
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

        var meterings = _sql.QualifyTable("dbo", "METERINGS");
        var objects = _sql.QualifyTable("dbo", "OBJECTS");
        var sourceColumn = _sql.QuoteIdentifier("SOURCE");

        var sql = $@"
            SELECT {_sql.SelectLimit(1000)}
                m.IDOBJECT_AGGREGATE as IdObjectAggregate, 
                m.IDOBJECT_AVERAGE as IdObjectAverage, 
                m.QUALITY as Quality, 
                m.QUALITY_SOURCE as QualitySource, 
                m.{sourceColumn} as Source, 
                m.VALUE_METERING as ValueMetering,
                m.IDOBJECT as IdObject,
                o.OBJECT_NAME as ObjectName
            FROM {meterings} m
            LEFT JOIN {objects} o ON m.IDOBJECT = o.IDOBJECT
            WHERE m.TIME_INSERT >= @p0 AND m.TIME_INSERT < @p1
            {(channelId.HasValue ? "AND m.IDOBJECT = @p2" : "")}
            {_sql.EndLimit(1000)}";

        var parameters = new List<object> { timestamp, endDate };
        if (channelId.HasValue) parameters.Add(channelId.Value);

        return await _context.Database
            .SqlQueryRaw<MeteringInfoDto>(sql, parameters.ToArray())
            .ToListAsync();
    }
}
