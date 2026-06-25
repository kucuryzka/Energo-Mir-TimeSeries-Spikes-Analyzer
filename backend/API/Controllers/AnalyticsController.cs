using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Core.Interfaces;
using Core.Models;
using API.Data;
using API.DTOs;

namespace API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AnalyticsController : ControllerBase
{
    private readonly ITimeSeriesService _timeSeriesService;
    private readonly ISpikeDetectionService _spikeDetectionService;
    private readonly AppDbContext _context;

    public AnalyticsController(
        ITimeSeriesService timeSeriesService,
        ISpikeDetectionService spikeDetectionService,
        AppDbContext context)
    {
        _timeSeriesService = timeSeriesService;
        _spikeDetectionService = spikeDetectionService;
        _context = context;
    }

    [HttpPost("detect-spikes")]
    public async Task<IActionResult> DetectSpikes([FromBody] DetectSpikesRequest request)
    {
        try
        {
            await SeedDatabaseIfEmptyAsync();

            var rawData = await _context.CallRecords
                .Where(r => r.Timestamp >= request.StartDate && r.Timestamp <= request.EndDate)
                .ToListAsync();

            var groupedSeries = _timeSeriesService.GroupByGranularity(
                rawData,
                request.Granularity,
                request.CustomMinutes);

            var anomalyResults = _spikeDetectionService.DetectSpikes(
                groupedSeries,
                request.Confidence,
                request.WindowSize);

            var response = new SpikeResponse
            {
                Series = anomalyResults.Select(r => new AnomalyResultDto
                {
                    Timestamp = r.Timestamp,
                    Value = r.Value,
                    IsSpike = r.IsSpike,
                    PValue = r.PValue
                }).ToList()
            };

            return Ok(response);
        }
        catch (NotImplementedException niex)
        {
            return StatusCode(501, new { message = "Backend Core services are not yet implemented.", details = niex.Message });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "An error occurred during spike detection.", details = ex.Message });
        }
    }

    private async Task SeedDatabaseIfEmptyAsync()
    {
        await _context.Database.EnsureCreatedAsync();

        if (!await _context.CallRecords.AnyAsync())
        {
            var random = new Random();
            var now = DateTime.UtcNow;
            var records = new List<CallRecord>();

            for (int i = 5 * 24 * 60; i >= 0; i -= 2)
            {
                var timestamp = now.AddMinutes(-i);
                int callsCount = random.Next(1, 10);
                
                if (random.NextDouble() > 0.98)
                {
                    callsCount = random.Next(40, 70);
                }

                for (int c = 0; c < callsCount; c++)
                {
                    var record = CreateCallRecord(timestamp.AddSeconds(random.Next(0, 59)));
                    records.Add(record);
                }
            }

            await _context.CallRecords.AddRangeAsync(records);
            await _context.SaveChangesAsync();
        }
    }

    private CallRecord CreateCallRecord(DateTime timestamp)
    {
        var record = (CallRecord)System.Runtime.CompilerServices.RuntimeHelpers.GetUninitializedObject(typeof(CallRecord));
        var field = typeof(CallRecord).GetField("<Timestamp>k__BackingField", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic);
        field?.SetValue(record, timestamp);
        return record;
    }
}
