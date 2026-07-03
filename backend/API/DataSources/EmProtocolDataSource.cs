using System;
using System.Collections.Generic;
using System.Data.Common;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using API.DTOs;
using Core.Enums;
using Core.Models;
using Core.Interfaces;

namespace API.DataSources;

public class EmProtocolDataSource : IDataSourceStrategy, ISupportsChannels, ISupportsDistribution
{
    private readonly DbContext _context;
    private readonly ISqlDialect _sql;
    private readonly string _id;
    private readonly string _name;

    public EmProtocolDataSource(DbContext context, ISqlDialect sql, string id, string name)
    {
        _context = context;
        _sql = sql;
        _id = id;
        _name = name;
    }

    public string Id => _id;
    public string Name => _name;
    public DataSourceKind Kind => DataSourceKind.EmProtocol;
    public DatabaseProvider Provider => _sql.Provider;
    public string[] SupportedDistributions => new[] { "EventCode" };

    public async Task<List<ChannelDto>> GetChannelsAsync(string? search, int page = 1, int pageSize = 50)
    {
        try
        {
            var channels = _sql.QualifyTable("em_protocol", "Channels");
            var objects = _sql.QualifyTable("dbo", "OBJECTS");
            var eventCodeText = _sql.CastToString("c.EventCode");

            var sql = $@"
                SELECT c.Id, {_sql.ConcatChannelName("o.OBJECT_NAME", "c.EventCode")} as Name, {eventCodeText} as EventCode
                FROM {channels} c
                JOIN {objects} o ON c.ObjectId = o.IDGLOBAL";
            
            var parameters = new List<object>();

            if (!string.IsNullOrWhiteSpace(search))
            {
                sql += $" WHERE o.OBJECT_NAME LIKE {{0}} OR {_sql.CastToString("c.EventCode")} LIKE {{0}}";
                parameters.Add($"%{search}%");
            }

            sql += $" ORDER BY o.OBJECT_NAME {_sql.LimitOffset((page - 1) * pageSize, pageSize)}";

            return await _context.Database.SqlQueryRaw<ChannelDto>(sql, parameters.ToArray()).ToListAsync();
        }
        catch (DbException)
        {
            return new List<ChannelDto>();
        }
    }

    public async Task<SpikeResponse> ExecuteAnalysisAsync(DetectSpikesRequest request, ISpikeDetectionService spikeDetectionService)
    {
        try
        {
            var records = _sql.QualifyTable("em_protocol", "Records");
            var dateAddExpr = _sql.GetTimeBucketExpression("InsertTime", request.Granularity, request.CustomMinutes);

            var channelFilter = (request.ChannelId.HasValue && request.ChannelId.Value > 0) 
                ? $"AND ChannelId = {request.ChannelId.Value}" 
                : "";

            var sqlAggregate = $@"
                SELECT 
                    {dateAddExpr} as Timestamp,
                    COUNT(*) as Value,
                    ChannelId
                FROM {records}
                WHERE InsertTime >= @p0 AND InsertTime <= @p1 {channelFilter}
                GROUP BY {dateAddExpr}, ChannelId
                ORDER BY Timestamp";

            var rawAggregates = await _context.Database
                .SqlQueryRaw<AggregatedResult>(sqlAggregate, request.StartDate, request.EndDate)
                .ToListAsync();

            var groupedSeries = rawAggregates
                .GroupBy(a => a.Timestamp)
                .Select(g => new DataPoint
                {
                    Timestamp = g.Key,
                    Value = g.Sum(x => x.Value),
                    ChannelBreakdown = g.ToDictionary(x => x.ChannelId, x => x.Value)
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

            var channelInfos = new Dictionary<int, ChannelDto>();
            if (channelIds.Any())
            {
                var channels = _sql.QualifyTable("em_protocol", "Channels");
                var objects = _sql.QualifyTable("dbo", "OBJECTS");
                var eventCodeText = _sql.CastToString("c.EventCode");
                var chunkSize = 1000;
                for (int i = 0; i < channelIds.Count; i += chunkSize)
                {
                    var chunk = channelIds.Skip(i).Take(chunkSize);
                    var idsString = string.Join(",", chunk);
                    var sql = $@"
                        SELECT c.Id, o.OBJECT_NAME as Name, {eventCodeText} as EventCode
                        FROM {channels} c
                        JOIN {objects} o ON c.ObjectId = o.IDGLOBAL
                        WHERE c.Id IN ({idsString})";
                    
                    var dbChannels = await _context.Database.SqlQueryRaw<ChannelDto>(sql).ToListAsync();
                    foreach (var c in dbChannels)
                    {
                        channelInfos[c.Id] = c;
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
                    ChannelBreakdown = r.ChannelBreakdown
                        .Select(kvp => 
                        {
                            var info = channelInfos.GetValueOrDefault(kvp.Key);
                            return new ChannelContributionDto
                            {
                                ChannelId = kvp.Key,
                                ChannelName = info?.Name ?? "Неизвестный канал",
                                EventCode = info?.EventCode,
                                Count = kvp.Value
                            };
                        })
                        .OrderByDescending(c => c.Count)
                        .ToList()
                }).ToList()
            };
        }
        catch (DbException)
        {
            return new SpikeResponse { Series = new List<AnomalyResultDto>() };
        }
    }

    public async Task<List<DistributionItemDto>> GetDistributionAsync(DateTime start, DateTime end, string categoryName)
    {
        if (categoryName != "EventCode")
        {
            return new List<DistributionItemDto>();
        }

        var records = _sql.QualifyTable("em_protocol", "Records");
        var channels = _sql.QualifyTable("em_protocol", "Channels");
        var eventCodeText = _sql.CastToString("c.EventCode");

        var sql = $@"
            SELECT {eventCodeText} as Category, COUNT(*) as Count
            FROM {records} r
            JOIN {channels} c ON r.ChannelId = c.Id
            WHERE r.InsertTime >= @p0 AND r.InsertTime <= @p1
            GROUP BY c.EventCode
            ORDER BY Count DESC";

        var result = await _context.Database
            .SqlQueryRaw<DistributionItemDto>(sql, start, end)
            .ToListAsync();

        return result;
    }
}
