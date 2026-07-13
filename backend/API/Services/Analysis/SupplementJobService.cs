using System.Globalization;
using System.Text.Json;
using API.Contracts;
using API.Data;
using API.DataSources;
using API.DTOs;
using API.DTOs.Analysis;
using API.Enums;
using API.Infrastructure.Database;
using API.Infrastructure.Session;
using API.Models;
using Core.Enums;
using Hangfire;
using Microsoft.EntityFrameworkCore;

namespace API.Services.Analysis;

public class SupplementJobService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    private readonly InternalDbContext _internalDb;
    private readonly AnalysisResultService _resultService;
    private readonly IConnectionManagerService _connectionManager;
    private readonly DboDataSource _dboDataSource;
    private readonly EmProtocolDataSource _emDataSource;
    private readonly IBackgroundJobClient _backgroundJobClient;
    private readonly ISupplementJobCancellationService _cancellation;
    private readonly ILogger<SupplementJobService> _logger;

    public SupplementJobService(
        InternalDbContext internalDb,
        AnalysisResultService resultService,
        IConnectionManagerService connectionManager,
        DboDataSource dboDataSource,
        EmProtocolDataSource emDataSource,
        IBackgroundJobClient backgroundJobClient,
        ISupplementJobCancellationService cancellation,
        ILogger<SupplementJobService> logger
    )
    {
        _internalDb = internalDb;
        _resultService = resultService;
        _connectionManager = connectionManager;
        _dboDataSource = dboDataSource;
        _emDataSource = emDataSource;
        _backgroundJobClient = backgroundJobClient;
        _cancellation = cancellation;
        _logger = logger;
    }

    public async Task<SupplementJob> StartPointDetailsAsync(
        string parentJobId,
        DateTime timestamp,
        string sessionToken,
        int? channelIdOverride = null,
        CancellationToken cancellationToken = default
    )
    {
        var parent = await RequireParentJobAsync(parentJobId, cancellationToken);
        EnsureParentReady(parent, parentJobId);

        var aligned = GranularityHelper.AlignToBucketStart(timestamp, parent.Granularity, parent.CustomMinutes);
        var channelId = channelIdOverride ?? ResolveChannelId(parent);
        var payload = JsonSerializer.Serialize(new PointDetailsSupplementPayload
        {
            TimestampIso = aligned.ToString("o", CultureInfo.InvariantCulture),
            ChannelId = channelId,
        }, JsonOptions);

        var existing = await FindActivePointDetailsJobAsync(parentJobId, payload, cancellationToken);
        if (existing != null)
            return existing;

        var supplement = await CreateAndEnqueueAsync(parent, SupplementJobKind.PointDetails, payload, sessionToken, cancellationToken);
        await MarkPointDetailsLoadingAsync(parentJobId, aligned, channelId, parent.Granularity, parent.CustomMinutes, cancellationToken);
        return supplement;
    }

    public async Task<SupplementJob> StartDistributionAsync(
        string parentJobId,
        string sessionToken,
        CancellationToken cancellationToken = default
    )
    {
        var parent = await RequireParentJobAsync(parentJobId, cancellationToken);
        EnsureParentReady(parent, parentJobId);

        var sourceId = parent.SourceId ?? parent.Schema;
        var categories = string.Equals(sourceId, "em_protocol", StringComparison.OrdinalIgnoreCase)
            ? _emDataSource.SupportedDistributions.ToList()
            : new List<string>();

        var payload = JsonSerializer.Serialize(new DistributionSupplementPayload { Categories = categories }, JsonOptions);

        var existing = await _internalDb.SupplementJobs.FirstOrDefaultAsync(
            s => s.ParentAnalysisJobId == parentJobId
                && s.Kind == SupplementJobKind.Distribution
                && (s.Status == AnalysisJobStatus.Pending || s.Status == AnalysisJobStatus.Running),
            cancellationToken
        );
        if (existing != null)
            return existing;

        return await CreateAndEnqueueAsync(parent, SupplementJobKind.Distribution, payload, sessionToken, cancellationToken);
    }

    public Task EnqueueDistributionAfterAnalysisAsync(string parentJobId, string sessionToken) =>
        StartDistributionAsync(parentJobId, sessionToken);

    public async Task<SupplementJob?> FindLatestPointDetailsSupplementAsync(
        AnalysisJob parent,
        DateTime alignedTimestamp,
        int? channelId,
        CancellationToken cancellationToken = default
    )
    {
        var payload = JsonSerializer.Serialize(new PointDetailsSupplementPayload
        {
            TimestampIso = alignedTimestamp.ToString("o", CultureInfo.InvariantCulture),
            ChannelId = channelId,
        }, JsonOptions);

        return await _internalDb.SupplementJobs
            .Where(s => s.ParentAnalysisJobId == parent.Id
                && s.Kind == SupplementJobKind.PointDetails
                && s.PayloadJson == payload)
            .OrderByDescending(s => s.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<bool> TryCancelAsync(string supplementJobId)
    {
        var job = await _internalDb.SupplementJobs.FindAsync(supplementJobId);
        if (job == null)
            return false;

        if (job.Status is AnalysisJobStatus.Completed or AnalysisJobStatus.Failed or AnalysisJobStatus.Cancelled)
            return false;

        _cancellation.StopAndDetach(job);

        if (job.Status == AnalysisJobStatus.Pending)
        {
            job.Status = AnalysisJobStatus.Cancelled;
            job.CompletedAt = DateTime.UtcNow;
            job.RunningStartedAt = null;
            job.ErrorMessage = "Задача отменена пользователем.";
            await _internalDb.SaveChangesAsync();
        }

        return true;
    }

    public async Task<(bool Ok, string? Error)> TryRetryAsync(string supplementJobId, string sessionToken)
    {
        var job = await _internalDb.SupplementJobs.FindAsync(supplementJobId);
        if (job == null)
            return (false, "Задача не найдена.");

        if (job.Status is not (AnalysisJobStatus.Failed or AnalysisJobStatus.Cancelled))
            return (false, "Перезапуск доступен только для отменённых или упавших задач.");

        if (await _internalDb.AnalysisJobs.FindAsync(job.ParentAnalysisJobId) == null)
            return (false, "Родительский анализ не найден.");

        _cancellation.DetachHangfire(job);
        job.Status = AnalysisJobStatus.Pending;
        job.ErrorMessage = null;
        job.CompletedAt = null;
        job.RunningStartedAt = null;
        job.BackgroundJobId = _backgroundJobClient.Enqueue<SupplementJobService>(s => s.ProcessAsync(job.Id, sessionToken));
        await _internalDb.SaveChangesAsync();
        return (true, null);
    }

    [AutomaticRetry(Attempts = 0)]
    [Queue("supplements")]
    public async Task ProcessAsync(string supplementJobId, string sessionToken)
    {
        var supplement = await _internalDb.SupplementJobs.FindAsync(supplementJobId);
        if (supplement == null || supplement.Status is AnalysisJobStatus.Completed or AnalysisJobStatus.Failed or AnalysisJobStatus.Cancelled)
            return;

        var parent = await _internalDb.AnalysisJobs.FindAsync(supplement.ParentAnalysisJobId);
        if (parent == null)
        {
            await FailSupplementAsync(supplement, "Родительский анализ не найден.");
            return;
        }

        var cancellationToken = _cancellation.Register(supplementJobId);
        supplement.Status = AnalysisJobStatus.Running;
        supplement.RunningStartedAt = DateTime.UtcNow;
        supplement.ErrorMessage = null;
        await _internalDb.SaveChangesAsync();

        try
        {
            if (_cancellation.IsCancellationRequested(supplementJobId))
            {
                await MarkCancelledAsync(supplement);
                return;
            }

            var connectionInfo = _connectionManager.GetConnectionInfo(sessionToken);
            if (connectionInfo == null)
            {
                await FailSupplementAsync(supplement, "Сессия БД недоступна. Подключитесь к той же базе и перезапустите задачу.");
                return;
            }

            if (!ConnectionFingerprint.Matches(supplement.ConnectionFingerprint, connectionInfo.Provider, connectionInfo.ConnectionString))
            {
                await FailSupplementAsync(supplement, "Текущее подключение не совпадает с сервером анализа.");
                return;
            }

            if (supplement.Kind == SupplementJobKind.PointDetails)
                await ProcessPointDetailsAsync(supplement, parent, connectionInfo.ConnectionString, connectionInfo.Provider, cancellationToken);
            else if (supplement.Kind == SupplementJobKind.Distribution)
                await ProcessDistributionAsync(supplement, parent, connectionInfo.ConnectionString, connectionInfo.Provider, cancellationToken);
            else
                throw new InvalidOperationException($"Неизвестный тип задачи: {supplement.Kind}");

            if (_cancellation.IsCancellationRequested(supplementJobId))
            {
                await MarkCancelledAsync(supplement);
                return;
            }

            supplement.Status = AnalysisJobStatus.Completed;
            supplement.CompletedAt = DateTime.UtcNow;
            supplement.RunningStartedAt = null;
            await _internalDb.SaveChangesAsync();
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            await MarkCancelledAsync(supplement);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Supplement job {SupplementJobId} failed", supplementJobId);
            await FailSupplementAsync(supplement, ex.Message);
        }
        finally
        {
            _cancellation.Unregister(supplementJobId);
        }
    }

    public AnalysisJobQueueItemDto MapToQueueItem(SupplementJob supplement, AnalysisJob parent) =>
        new()
        {
            Id = supplement.Id,
            QueueJobKind = supplement.Kind switch
            {
                SupplementJobKind.PointDetails => AnalysisQueueJobKind.PointDetails,
                SupplementJobKind.Distribution => AnalysisQueueJobKind.Distribution,
                _ => AnalysisQueueJobKind.PointDetails,
            },
            ParentJobId = parent.Id,
            SupplementLabel = BuildSupplementLabel(supplement),
            Status = supplement.Status,
            Progress = supplement.Status switch
            {
                AnalysisJobStatus.Completed => 100,
                AnalysisJobStatus.Running => 50,
                _ => 0,
            },
            Database = supplement.Database,
            ConnectionHint = ConnectionFingerprint.ToDisplay(supplement.ConnectionFingerprint),
            Schema = parent.Schema,
            Table = parent.Table,
            SourceKind = ResolveSourceKind(parent),
            StartDate = parent.StartDate,
            EndDate = parent.EndDate,
            Granularity = parent.Granularity,
            CreatedAt = supplement.CreatedAt,
            CompletedAt = supplement.CompletedAt,
            TimeColumn = parent.TimeColumn,
            CustomMinutes = parent.CustomMinutes,
            ChannelId = ResolveChannelId(parent)?.ToString(),
            HasPartialResult = false,
            HasResult = supplement.Status == AnalysisJobStatus.Completed,
            CanResume = false,
            CanRetry = supplement.Status is AnalysisJobStatus.Failed or AnalysisJobStatus.Cancelled,
            RunningStartedAt = supplement.RunningStartedAt,
            ActiveDurationMs = ComputeSupplementActiveDurationMs(supplement),
            ErrorMessage = supplement.ErrorMessage,
        };

    private async Task ProcessPointDetailsAsync(
        SupplementJob supplement,
        AnalysisJob parent,
        string connectionString,
        DatabaseProviderKind provider,
        CancellationToken cancellationToken
    )
    {
        var payload = JsonSerializer.Deserialize<PointDetailsSupplementPayload>(supplement.PayloadJson, JsonOptions)
            ?? throw new InvalidOperationException("Некорректный payload детализации точки.");

        if (!DateTime.TryParse(payload.TimestampIso, null, DateTimeStyles.RoundtripKind, out var timestamp))
            throw new InvalidOperationException("Некорректная метка времени точки.");

        timestamp = GranularityHelper.AlignToBucketStart(timestamp, parent.Granularity, parent.CustomMinutes);

        var sourceId = parent.SourceId ?? parent.Schema;
        cancellationToken.ThrowIfCancellationRequested();

        List<ChannelContributionDto> breakdown;
        List<MeteringInfoDto>? meteringRows = null;

        if (string.Equals(sourceId, "dbo", StringComparison.OrdinalIgnoreCase))
        {
            breakdown = await _dboDataSource.GetPointChannelBreakdownAsync(
                parent.Database, timestamp, parent.Granularity, parent.CustomMinutes, payload.ChannelId,
                connectionString, provider
            );
            cancellationToken.ThrowIfCancellationRequested();
            meteringRows = await _dboDataSource.GetPointDetailsAsync(
                parent.Database, timestamp, parent.Granularity, parent.CustomMinutes, payload.ChannelId,
                connectionString, provider
            );
        }
        else if (string.Equals(sourceId, "em_protocol", StringComparison.OrdinalIgnoreCase))
        {
            breakdown = await _emDataSource.GetPointChannelBreakdownAsync(
                parent.Database, timestamp, parent.Granularity, parent.CustomMinutes, payload.ChannelId,
                connectionString, provider
            );
        }
        else
        {
            throw new InvalidOperationException($"Источник {sourceId} не поддерживает детализацию точки.");
        }

        cancellationToken.ThrowIfCancellationRequested();

        await _resultService.UpsertPointDetailsLineAsync(parent.Id, new PointDetailsLineDto
        {
            Timestamp = timestamp,
            ChannelId = payload.ChannelId,
            Status = "complete",
            ChannelBreakdown = breakdown,
            MeteringRows = meteringRows,
            CompletedAt = DateTime.UtcNow,
            RequestedAt = DateTime.UtcNow,
        }, parent.Granularity, parent.CustomMinutes, cancellationToken);
        await _resultService.PatchSeriesChannelBreakdownAsync(parent, timestamp, breakdown, cancellationToken);
    }

    private async Task ProcessDistributionAsync(
        SupplementJob supplement,
        AnalysisJob parent,
        string connectionString,
        DatabaseProviderKind provider,
        CancellationToken cancellationToken
    )
    {
        var payload = JsonSerializer.Deserialize<DistributionSupplementPayload>(supplement.PayloadJson, JsonOptions)
            ?? new DistributionSupplementPayload();
        var sourceId = parent.SourceId ?? parent.Schema;
        var channelId = ResolveChannelId(parent);

        if (string.Equals(sourceId, "dbo", StringComparison.OrdinalIgnoreCase))
        {
            var distribution = await _dboDataSource.GetObjectDistributionAsync(
                parent.Database, parent.StartDate, parent.EndDate, channelId, connectionString, provider
            );
            cancellationToken.ThrowIfCancellationRequested();
            await SaveParentDistributionAsync(parent, distribution, null, cancellationToken);
            return;
        }

        if (string.Equals(sourceId, "em_protocol", StringComparison.OrdinalIgnoreCase))
        {
            var categorical = new Dictionary<string, List<DistributionItemDto>>(StringComparer.Ordinal);
            foreach (var category in payload.Categories)
            {
                categorical[category] = await _emDataSource.GetDistributionAsync(
                    parent.Database, parent.StartDate, parent.EndDate, category, connectionString, provider
                );
                cancellationToken.ThrowIfCancellationRequested();
            }

            await SaveParentDistributionAsync(parent, null, categorical, cancellationToken);
            return;
        }

        throw new InvalidOperationException($"Источник {sourceId} не поддерживает фоновую загрузку распределения.");
    }

    private async Task SaveParentDistributionAsync(
        AnalysisJob parent,
        List<ChannelContributionDto>? distribution,
        Dictionary<string, List<DistributionItemDto>>? categorical,
        CancellationToken cancellationToken
    )
    {
        var metadata = string.IsNullOrWhiteSpace(parent.ResultJson)
            ? new AnalysisJobMetadata()
            : JsonSerializer.Deserialize<AnalysisJobMetadata>(parent.ResultJson, JsonOptions) ?? new AnalysisJobMetadata();

        if (distribution != null)
            metadata.Distribution = distribution;
        if (categorical != null)
            metadata.CategoricalDistributions = categorical;

        parent.ResultJson = JsonSerializer.Serialize(metadata, JsonOptions);
        await _internalDb.SaveChangesAsync(cancellationToken);
    }

    private async Task<SupplementJob> CreateAndEnqueueAsync(
        AnalysisJob parent,
        SupplementJobKind kind,
        string payloadJson,
        string sessionToken,
        CancellationToken cancellationToken
    )
    {
        var supplement = new SupplementJob
        {
            Kind = kind,
            ParentAnalysisJobId = parent.Id,
            Database = parent.Database,
            ConnectionFingerprint = parent.ConnectionFingerprint,
            PayloadJson = payloadJson,
        };

        _internalDb.SupplementJobs.Add(supplement);
        await _internalDb.SaveChangesAsync(cancellationToken);

        supplement.BackgroundJobId = _backgroundJobClient.Enqueue<SupplementJobService>(
            s => s.ProcessAsync(supplement.Id, sessionToken)
        );
        await _internalDb.SaveChangesAsync(cancellationToken);
        return supplement;
    }

    private async Task<SupplementJob?> FindActivePointDetailsJobAsync(
        string parentJobId,
        string payloadJson,
        CancellationToken cancellationToken
    ) =>
        await _internalDb.SupplementJobs.FirstOrDefaultAsync(
            s => s.ParentAnalysisJobId == parentJobId
                && s.Kind == SupplementJobKind.PointDetails
                && s.PayloadJson == payloadJson
                && (s.Status == AnalysisJobStatus.Pending || s.Status == AnalysisJobStatus.Running),
            cancellationToken
        );

    private async Task<AnalysisJob> RequireParentJobAsync(string parentJobId, CancellationToken cancellationToken)
    {
        var parent = await _internalDb.AnalysisJobs.FindAsync([parentJobId], cancellationToken);
        if (parent == null)
            throw new KeyNotFoundException("Задача анализа не найдена.");
        return parent;
    }

    private void EnsureParentReady(AnalysisJob parent, string parentJobId)
    {
        if (parent.Status is AnalysisJobStatus.Completed or AnalysisJobStatus.Cancelled)
            return;
        if (_resultService.HasPartialResult(parentJobId))
            return;
        throw new InvalidOperationException("Результат анализа ещё не готов.");
    }

    private async Task MarkPointDetailsLoadingAsync(
        string parentJobId,
        DateTime timestamp,
        int? channelId,
        TimeGranularity granularity,
        int? customMinutes,
        CancellationToken cancellationToken
    )
    {
        await _resultService.UpsertPointDetailsLineAsync(parentJobId, new PointDetailsLineDto
        {
            Timestamp = timestamp,
            ChannelId = channelId,
            Status = "loading",
            RequestedAt = DateTime.UtcNow,
        }, granularity, customMinutes, cancellationToken);
    }

    private async Task FailSupplementAsync(SupplementJob supplement, string message)
    {
        if (supplement.Kind == SupplementJobKind.PointDetails)
        {
            var parent = await _internalDb.AnalysisJobs.FindAsync(supplement.ParentAnalysisJobId);
            var payload = JsonSerializer.Deserialize<PointDetailsSupplementPayload>(supplement.PayloadJson, JsonOptions);
            if (parent != null
                && payload != null
                && DateTime.TryParse(payload.TimestampIso, null, DateTimeStyles.RoundtripKind, out var timestamp))
            {
                timestamp = GranularityHelper.AlignToBucketStart(timestamp, parent.Granularity, parent.CustomMinutes);
                await _resultService.UpsertPointDetailsLineAsync(supplement.ParentAnalysisJobId, new PointDetailsLineDto
                {
                    Timestamp = timestamp,
                    ChannelId = payload.ChannelId,
                    Status = "failed",
                    ErrorMessage = message,
                    RequestedAt = DateTime.UtcNow,
                    CompletedAt = DateTime.UtcNow,
                }, parent.Granularity, parent.CustomMinutes);
            }
        }

        supplement.Status = AnalysisJobStatus.Failed;
        supplement.ErrorMessage = message;
        supplement.CompletedAt = DateTime.UtcNow;
        supplement.RunningStartedAt = null;
        await _internalDb.SaveChangesAsync();
    }

    private async Task MarkCancelledAsync(SupplementJob supplement)
    {
        if (supplement.Kind == SupplementJobKind.PointDetails)
        {
            var parent = await _internalDb.AnalysisJobs.FindAsync(supplement.ParentAnalysisJobId);
            var payload = JsonSerializer.Deserialize<PointDetailsSupplementPayload>(supplement.PayloadJson, JsonOptions);
            if (parent != null
                && payload != null
                && DateTime.TryParse(payload.TimestampIso, null, DateTimeStyles.RoundtripKind, out var timestamp))
            {
                timestamp = GranularityHelper.AlignToBucketStart(timestamp, parent.Granularity, parent.CustomMinutes);
                await _resultService.UpsertPointDetailsLineAsync(supplement.ParentAnalysisJobId, new PointDetailsLineDto
                {
                    Timestamp = timestamp,
                    ChannelId = payload.ChannelId,
                    Status = "failed",
                    ErrorMessage = "Задача отменена пользователем.",
                    RequestedAt = DateTime.UtcNow,
                    CompletedAt = DateTime.UtcNow,
                }, parent.Granularity, parent.CustomMinutes);
            }
        }

        supplement.Status = AnalysisJobStatus.Cancelled;
        supplement.ErrorMessage = "Задача отменена пользователем.";
        supplement.CompletedAt = DateTime.UtcNow;
        supplement.RunningStartedAt = null;
        await _internalDb.SaveChangesAsync();
    }

    private static string BuildSupplementLabel(SupplementJob supplement)
    {
        if (supplement.Kind == SupplementJobKind.Distribution)
            return "Распределение";

        var payload = JsonSerializer.Deserialize<PointDetailsSupplementPayload>(supplement.PayloadJson, JsonOptions);
        if (payload == null || string.IsNullOrWhiteSpace(payload.TimestampIso))
            return "Детали точки";

        if (DateTime.TryParse(payload.TimestampIso, null, System.Globalization.DateTimeStyles.RoundtripKind, out var ts))
            return $"Детали: {ts.ToLocalTime():dd.MM.yyyy HH:mm}";

        return "Детали точки";
    }

    private static long? ComputeSupplementActiveDurationMs(SupplementJob supplement)
    {
        if (supplement.RunningStartedAt.HasValue && supplement.Status == AnalysisJobStatus.Running)
            return (long)Math.Max(0, (DateTime.UtcNow - supplement.RunningStartedAt.Value).TotalMilliseconds);

        if (supplement.CompletedAt.HasValue)
            return (long)Math.Max(0, (supplement.CompletedAt.Value - supplement.CreatedAt).TotalMilliseconds);

        return null;
    }

    private static AnalysisSourceKind ResolveSourceKind(AnalysisJob job) =>
        job.Schema switch
        {
            "dbo" => AnalysisSourceKind.dbo,
            "em_protocol" => AnalysisSourceKind.em_protocol,
            _ => AnalysisSourceKind.generic,
        };

    private static int? ResolveChannelId(AnalysisJob job) =>
        job.Schema is "dbo" or "em_protocol"
        && !string.IsNullOrEmpty(job.Table)
        && !string.Equals(job.Table, "All", StringComparison.OrdinalIgnoreCase)
        && int.TryParse(job.Table, out var cid)
            ? cid
            : null;
}
