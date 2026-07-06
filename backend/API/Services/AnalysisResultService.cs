using System.Text.Json;
using API.Configuration;
using API.DTOs;
using API.Models;
using Microsoft.Extensions.Options;

namespace API.Services;

public class AnalysisResultService
{
    private readonly string _resultsRoot;
    private readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public AnalysisResultService(IHostEnvironment environment, IOptions<AnalysisSettings> settings)
    {
        var resultsDir = settings.Value.ResultsDirectory;
        _resultsRoot = Path.IsPathRooted(resultsDir)
            ? resultsDir
            : Path.Combine(environment.ContentRootPath, resultsDir);
        Directory.CreateDirectory(_resultsRoot);
    }

    public bool HasResult(AnalysisJob job)
    {
        if (job.Status != "Completed" || string.IsNullOrEmpty(job.ResultFilePath))
            return false;

        return File.Exists(Path.Combine(_resultsRoot, job.ResultFilePath));
    }

    public async Task SaveAsync(AnalysisJob job, SpikeResponse response, CancellationToken cancellationToken = default)
    {
        var fileName = $"{job.Id}.jsonl";
        var fullPath = Path.Combine(_resultsRoot, fileName);
        var tempPath = fullPath + ".tmp";

        try
        {
            await using (var stream = new FileStream(tempPath, FileMode.Create, FileAccess.Write, FileShare.None))
            await using (var writer = new StreamWriter(stream))
            {
                foreach (var point in response.Series)
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    await writer.WriteLineAsync(JsonSerializer.Serialize(point, _jsonOptions));
                }
            }

            File.Move(tempPath, fullPath, overwrite: true);
        }
        catch
        {
            if (File.Exists(tempPath))
                File.Delete(tempPath);
            throw;
        }

        job.ResultFilePath = fileName;
        job.SeriesPointCount = response.Series.Count;
        job.ResultJson = JsonSerializer.Serialize(
            new AnalysisJobMetadata { Distribution = response.Distribution },
            _jsonOptions);
    }

    public async Task<SpikeResponse> LoadAsync(AnalysisJob job, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(job.ResultFilePath))
            throw new InvalidOperationException("Analysis result file is not available.");

        var series = await LoadSeriesFromFileAsync(job.ResultFilePath, cancellationToken);
        var metadata = DeserializeMetadata(job.ResultJson);

        return new SpikeResponse
        {
            Series = series,
            Distribution = metadata.Distribution
        };
    }

    public async Task<string> SerializeToJsonAsync(AnalysisJob job, CancellationToken cancellationToken = default)
    {
        var response = await LoadAsync(job, cancellationToken);
        return JsonSerializer.Serialize(response, _jsonOptions);
    }

    public void DeleteResultFiles(AnalysisJob job)
    {
        if (string.IsNullOrEmpty(job.ResultFilePath))
            return;

        var fullPath = Path.Combine(_resultsRoot, job.ResultFilePath);
        if (File.Exists(fullPath))
            File.Delete(fullPath);

        var tempPath = fullPath + ".tmp";
        if (File.Exists(tempPath))
            File.Delete(tempPath);
    }

    private async Task<List<AnomalyResultDto>> LoadSeriesFromFileAsync(
        string fileName,
        CancellationToken cancellationToken)
    {
        var fullPath = Path.Combine(_resultsRoot, fileName);
        if (!File.Exists(fullPath))
            throw new FileNotFoundException("Analysis result file was not found.", fullPath);

        var series = new List<AnomalyResultDto>();
        await foreach (var line in File.ReadLinesAsync(fullPath, cancellationToken))
        {
            if (string.IsNullOrWhiteSpace(line))
                continue;

            var point = JsonSerializer.Deserialize<AnomalyResultDto>(line, _jsonOptions)
                ?? throw new InvalidDataException("Analysis result file contains an invalid line.");

            series.Add(point);
        }

        return series;
    }

    private AnalysisJobMetadata DeserializeMetadata(string? json)
    {
        if (string.IsNullOrEmpty(json))
            return new AnalysisJobMetadata();

        return JsonSerializer.Deserialize<AnalysisJobMetadata>(json, _jsonOptions) ?? new AnalysisJobMetadata();
    }
}
