using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using API.Data;
using API.DTOs;
using Core.Enums;
using Core.Models;

namespace API.DataSources;

public class EmProtocolDataSource : IDataSourceStrategy
{
    private readonly AppDbContext _context;

    public EmProtocolDataSource(AppDbContext context)
    {
        _context = context;
    }

    public string Id => "em_protocol";
    public string Name => "Протокол EM";

    public async Task<List<ChannelDto>> GetChannelsAsync(string? search, int page, int pageSize)
    {
        var sql = @"
            SELECT c.Id, CONCAT(o.OBJECT_NAME, ' (', c.EventCode, ')') as Name
            FROM em_protocol.Channels c
            JOIN dbo.OBJECTS o ON c.ObjectId = o.IDGLOBAL";
        
        var parameters = new List<object>();

        if (!string.IsNullOrWhiteSpace(search))
        {
            sql += " WHERE o.OBJECT_NAME LIKE {0} OR CAST(c.EventCode as NVARCHAR) LIKE {0}";
            parameters.Add($"%{search}%");
        }

        sql += $" ORDER BY o.OBJECT_NAME OFFSET {(page - 1) * pageSize} ROWS FETCH NEXT {pageSize} ROWS ONLY";

        return await _context.Database.SqlQueryRaw<ChannelDto>(sql, parameters.ToArray()).ToListAsync();
    }

    public async Task<List<AggregatedResult>> GetAggregatedDataAsync(DateTime start, DateTime end, int? channelId, TimeGranularity granularity, int? customMinutes)
    {
        var dateAddExpr = granularity switch
        {
            TimeGranularity.Minute => "DATEADD(minute, DATEDIFF(minute, 0, InsertTime), 0)",
            TimeGranularity.Hour => "DATEADD(hour, DATEDIFF(hour, 0, InsertTime), 0)",
            TimeGranularity.Day => "DATEADD(day, DATEDIFF(day, 0, InsertTime), 0)",
            TimeGranularity.Week => "DATEADD(week, DATEDIFF(week, 0, InsertTime), 0)",
            TimeGranularity.Month => "DATEADD(month, DATEDIFF(month, 0, InsertTime), 0)",
            TimeGranularity.Custom => $"DATEADD(minute, (DATEDIFF(minute, 0, InsertTime) / {(customMinutes ?? 60)}) * {(customMinutes ?? 60)}, 0)",
            _ => "DATEADD(hour, DATEDIFF(hour, 0, InsertTime), 0)"
        };

        var channelFilter = (channelId.HasValue && channelId.Value > 0) 
            ? $"AND ChannelId = {channelId.Value}" 
            : "";

        var sqlAggregate = $@"
            SELECT 
                {dateAddExpr} as Timestamp,
                COUNT(*) as Value,
                ChannelId
            FROM em_protocol.Records
            WHERE InsertTime >= @p0 AND InsertTime <= @p1 {channelFilter}
            GROUP BY {dateAddExpr}, ChannelId
            ORDER BY Timestamp";

        return await _context.Database
            .SqlQueryRaw<AggregatedResult>(sqlAggregate, start, end)
            .ToListAsync();
    }

    public async Task<Dictionary<int, string>> GetChannelNamesAsync(List<int> channelIds)
    {
        if (!channelIds.Any()) return new Dictionary<int, string>();

        var idsString = string.Join(",", channelIds);
        var sql = $@"
            SELECT c.Id, CONCAT(o.OBJECT_NAME, ' (', c.EventCode, ')') as Name
            FROM em_protocol.Channels c
            JOIN dbo.OBJECTS o ON c.ObjectId = o.IDGLOBAL
            WHERE c.Id IN ({idsString})";
        
        var dbChannels = await _context.Database.SqlQueryRaw<ChannelDto>(sql).ToListAsync();
        return dbChannels.ToDictionary(c => c.Id, c => c.Name);
    }
}
