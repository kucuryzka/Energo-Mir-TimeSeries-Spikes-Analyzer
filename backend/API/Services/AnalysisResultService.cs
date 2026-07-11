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
        if (job.Status != "Completed")
            return false;

        if (HasResultFile(job))
            return true;

        return HasLegacyInlineResult(job);
    }

    public string? ResolveResultFilePath(AnalysisJob job)
    {
        if (!string.IsNullOrEmpty(job.ResultFilePath))
        {
            var configuredPath = Path.Combine(_resultsRoot, job.ResultFilePath);
            if (File.Exists(configuredPath))
                return job.ResultFilePath;
        }

        var fallbackName = $"{job.Id}.jsonl";
        if (File.Exists(Path.Combine(_resultsRoot, fallbackName)))
            return fallbackName;

        return null;
    }

    private bool HasResultFile(AnalysisJob job) =>
        ResolveResultFilePath(job) != null;

    private static bool HasLegacyInlineResult(AnalysisJob job)
    {
        if (string.IsNullOrWhiteSpace(job.ResultJson))
            return false;

        try
        {
            using var doc = JsonDocument.Parse(job.ResultJson);
            return doc.RootElement.TryGetProperty("series", out var series)
                && series.ValueKind == JsonValueKind.Array
                && series.GetArrayLength() > 0;
        }
        catch (JsonException)
        {
            return false;
        }
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
        var resultFilePath = ResolveResultFilePath(job);
        if (resultFilePath != null)
        {
            var series = await LoadSeriesFromFileAsync(resultFilePath, cancellationToken);
            var metadata = DeserializeMetadata(job.ResultJson);
            return new SpikeResponse
            {
                Series = series,
                Distribution = metadata.Distribution
            };
        }

        var legacy = TryLoadLegacyResponse(job);
        if (legacy != null)
            return legacy;

        throw new InvalidOperationException("Analysis result is not available.");
    }

    private SpikeResponse? TryLoadLegacyResponse(AnalysisJob job)
    {
        if (!HasLegacyInlineResult(job))
            return null;

        return JsonSerializer.Deserialize<SpikeResponse>(job.ResultJson!, _jsonOptions);
    }

    public async Task<string> SerializeToJsonAsync(AnalysisJob job, CancellationToken cancellationToken = default)
    {
        var response = await LoadAsync(job, cancellationToken);
        return JsonSerializer.Serialize(response, _jsonOptions);
    }

    public void DeleteResultFiles(AnalysisJob job)
    {
        if (!string.IsNullOrEmpty(job.ResultFilePath))
            DeleteFileIfExists(Path.Combine(_resultsRoot, job.ResultFilePath));

        DeleteFileIfExists(Path.Combine(_resultsRoot, $"{job.Id}.jsonl"));
        DeletePartialFile(job.Id);
    }

    private static void DeleteFileIfExists(string fullPath)
    {
        if (File.Exists(fullPath))
            File.Delete(fullPath);

        var tempPath = fullPath + ".tmp";
        if (File.Exists(tempPath))
            File.Delete(tempPath);
    }

    public bool HasPartialResult(string jobId) =>
        File.Exists(GetPartialFilePath(jobId));

    public async Task AppendPartialSeriesAsync(
        string jobId,
        IReadOnlyList<Core.Models.DataPoint> batchPoints,
        CancellationToken cancellationToken = default)
    {
        if (batchPoints.Count == 0)
            return;

        var fullPath = GetPartialFilePath(jobId);
        var previousLength = File.Exists(fullPath) ? new FileInfo(fullPath).Length : 0L;

        try
        {
            await using var stream = new FileStream(fullPath, FileMode.Append, FileAccess.Write, FileShare.Read);
            await using var writer = new StreamWriter(stream);
            foreach (var point in batchPoints)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var dto = new AnomalyResultDto
                {
                    Timestamp = point.Timestamp,
                    Value = point.Value,
                    IsSpike = false,
                    PValue = 1.0
                };
                await writer.WriteLineAsync(JsonSerializer.Serialize(dto, _jsonOptions));
            }

            await writer.FlushAsync(cancellationToken);
            await stream.FlushAsync(cancellationToken);
        }
        catch
        {
            TryTruncateFile(fullPath, previousLength);
            throw;
        }
    }

    public async Task<List<AnomalyResultDto>> LoadPartialAlignedAsync(
        string jobId,
        DateTime processedUntilExclusive,
        CancellationToken cancellationToken = default)
    {
        var fileName = GetPartialFileName(jobId);
        if (!File.Exists(Path.Combine(_resultsRoot, fileName)))
            return new List<AnomalyResultDto>();

        var series = await LoadSeriesFromFileAsync(fileName, cancellationToken);
        var aligned = series.Where(p => p.Timestamp < processedUntilExclusive).ToList();
        if (aligned.Count < series.Count)
            await RewritePartialSeriesAsync(jobId, aligned, cancellationToken);

        return aligned;
    }

    private async Task RewritePartialSeriesAsync(
        string jobId,
        IReadOnlyList<AnomalyResultDto> series,
        CancellationToken cancellationToken)
    {
        var fullPath = GetPartialFilePath(jobId);
        var tempPath = fullPath + ".tmp";

        try
        {
            await using (var stream = new FileStream(tempPath, FileMode.Create, FileAccess.Write, FileShare.None))
            await using (var writer = new StreamWriter(stream))
            {
                foreach (var point in series)
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
            {
                try { File.Delete(tempPath); } catch { /* best effort */ }
            }
            throw;
        }
    }

    private static void TryTruncateFile(string fullPath, long length)
    {
        try
        {
            if (!File.Exists(fullPath))
                return;

            if (length <= 0)
            {
                File.Delete(fullPath);
                return;
            }

            using var stream = new FileStream(fullPath, FileMode.Open, FileAccess.Write, FileShare.None);
            stream.SetLength(length);
        }
        catch
        {
            // best effort — resume alignment still filters by ProcessedUntil
        }
    }

    public bool CanExport(AnalysisJob job) =>
        job.Status is "Completed" or "Cancelled"
        && HasResultFile(job);

    public async Task<SpikeResponse?> TryLoadPartialAsync(string jobId, CancellationToken cancellationToken = default)
    {
        var fileName = GetPartialFileName(jobId);
        if (!File.Exists(Path.Combine(_resultsRoot, fileName)))
            return null;

        var series = await LoadSeriesFromFileAsync(fileName, cancellationToken);
        return new SpikeResponse { Series = series };
    }

    public void DeletePartialFile(string jobId)
    {
        DeleteFileIfExists(GetPartialFilePath(jobId));
    }

    private static string GetPartialFileName(string jobId) => $"{jobId}.partial.jsonl";

    private string GetPartialFilePath(string jobId) =>
        Path.Combine(_resultsRoot, GetPartialFileName(jobId));

    private async Task<List<AnomalyResultDto>> LoadSeriesFromFileAsync(
        string fileName,
        CancellationToken cancellationToken)
    {
        var fullPath = Path.Combine(_resultsRoot, fileName);
        if (!File.Exists(fullPath))
            throw new FileNotFoundException("Analysis result file was not found.", fullPath);

        var series = new List<AnomalyResultDto>();
        await using var stream = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
        using var reader = new StreamReader(stream);
        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var line = await reader.ReadLineAsync(cancellationToken);
            if (line is null)
                break;

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
