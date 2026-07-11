using API.Contracts;
using API.Data;
using API.DTOs;
using API.Models;
using Hangfire;
using Hangfire.Storage;
using Microsoft.EntityFrameworkCore;

namespace API.Services.Analysis;

public class AnalysisJobCoordinatorService
{
    private readonly InternalDbContext _db;
    private readonly IBackgroundJobClient _backgroundJobClient;
    private readonly IAnalysisJobCancellationService _cancellation;
    private readonly AnalysisResultService _resultService;
    private readonly IConnectionManagerService _connectionManager;
    private readonly AnalysisRequestValidator _requestValidator;

    public AnalysisJobCoordinatorService(
        InternalDbContext db,
        IBackgroundJobClient backgroundJobClient,
        IAnalysisJobCancellationService cancellation,
        AnalysisResultService resultService,
        IConnectionManagerService connectionManager,
        AnalysisRequestValidator requestValidator
    )
    {
        _db = db;
        _backgroundJobClient = backgroundJobClient;
        _cancellation = cancellation;
        _resultService = resultService;
        _connectionManager = connectionManager;
        _requestValidator = requestValidator;
    }

    public async Task<string> EnqueueAsync(
        EnqueueAnalysisJobRequest request,
        string sessionToken,
        DatabaseSessionInfo connection
    )
    {
        var sourceId = NormalizeSourceId(request.SourceId);
        if (sourceId is "dbo" or "em_protocol")
        {
            return await EnqueueSourceAnalysisAsync(
                new DetectSpikesRequest
                {
                    Database = request.Database,
                    SourceId = sourceId,
                    ChannelId = request.ChannelId,
                    Granularity = request.Granularity,
                    CustomMinutes = request.CustomMinutes,
                    Confidence = request.Confidence,
                    WindowSize = request.WindowSize,
                    StartDate = request.StartDate,
                    EndDate = request.EndDate
                },
                schema: sourceId,
                sourceId,
                sessionToken,
                connection
            );
        }

        if (sourceId != null)
            throw new ArgumentException($"Unknown SourceId '{request.SourceId}'. Use 'dbo', 'em_protocol', or omit for generic analysis.");

        return await EnqueueGenericAnalysisAsync(
            new GenericAnalysisRequest
            {
                Database = request.Database,
                Schema = request.Schema ?? string.Empty,
                Table = request.Table ?? string.Empty,
                TimeColumn = request.TimeColumn ?? string.Empty,
                StartDate = request.StartDate,
                EndDate = request.EndDate,
                Granularity = request.Granularity,
                CustomMinutes = request.CustomMinutes,
                Confidence = request.Confidence,
                WindowSize = request.WindowSize
            },
            sessionToken,
            connection
        );
    }

    private static string? NormalizeSourceId(string? sourceId)
    {
        if (string.IsNullOrWhiteSpace(sourceId))
            return null;

        return sourceId.Trim().ToLowerInvariant() switch
        {
            "dbo" => "dbo",
            "em_protocol" or "em-protocol" => "em_protocol",
            _ => sourceId.Trim()
        };
    }

    public async Task<string> EnqueueSourceAnalysisAsync(
        DetectSpikesRequest request,
        string schema,
        string sourceId,
        string sessionToken,
        DatabaseSessionInfo connection
    )
    {
        _requestValidator.Validate(
            request.StartDate,
            request.EndDate,
            request.Granularity,
            request.WindowSize,
            request.CustomMinutes
        );

        var job = new AnalysisJob
        {
            Database = request.Database,
            Schema = schema,
            Table = request.ChannelId?.ToString() ?? "All",
            TimeColumn = "",
            StartDate = request.StartDate,
            EndDate = request.EndDate,
            Granularity = request.Granularity,
            CustomMinutes = request.CustomMinutes,
            Confidence = request.Confidence,
            WindowSize = request.WindowSize,
            SourceId = sourceId,
            ConnectionFingerprint = ConnectionFingerprint.From(connection.Provider, connection.ConnectionString)
        };

        _db.AnalysisJobs.Add(job);
        await _db.SaveChangesAsync();

        var hangfireId = _backgroundJobClient.Enqueue<AnalysisJobProcessor>(
            p => p.ProcessSourceJobAsync(job.Id, sourceId, sessionToken)
        );

        job.BackgroundJobId = hangfireId;
        await _db.SaveChangesAsync();
        return job.Id;
    }

    public async Task<string> EnqueueGenericAnalysisAsync(
        GenericAnalysisRequest request,
        string sessionToken,
        DatabaseSessionInfo connection
    )
    {
        _requestValidator.Validate(
            request.StartDate,
            request.EndDate,
            request.Granularity,
            request.WindowSize,
            request.CustomMinutes
        );
        _requestValidator.ValidateIdentifiers(request.Schema, request.Table, request.TimeColumn);

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
            WindowSize = request.WindowSize,
            ConnectionFingerprint = ConnectionFingerprint.From(connection.Provider, connection.ConnectionString)
        };

        _db.AnalysisJobs.Add(job);
        await _db.SaveChangesAsync();

        var hangfireId = _backgroundJobClient.Enqueue<AnalysisJobProcessor>(
            p => p.ProcessJobAsync(job.Id, sessionToken)
        );

        job.BackgroundJobId = hangfireId;
        await _db.SaveChangesAsync();
        return job.Id;
    }

    public async Task<AnalysisJobsOverviewDto> GetOverviewAsync(string? database = null, int recentLimit = 50)
    {
        var activeQuery = _db.AnalysisJobs
            .Where(j => j.Status == AnalysisJobStatus.Pending || j.Status == AnalysisJobStatus.Running);

        var recentQuery = _db.AnalysisJobs
            .Where(j => j.Status == AnalysisJobStatus.Completed || j.Status == AnalysisJobStatus.Failed || j.Status == AnalysisJobStatus.Cancelled);

        if (!string.IsNullOrWhiteSpace(database))
        {
            activeQuery = activeQuery.Where(j => j.Database == database);
            recentQuery = recentQuery.Where(j => j.Database == database);
        }

        var activeJobs = await activeQuery
            .OrderBy(j => j.CreatedAt)
            .ToListAsync();

        var recentJobs = await recentQuery
            .OrderByDescending(j => j.CompletedAt ?? j.CreatedAt)
            .Take(Math.Clamp(recentLimit, 1, 200))
            .ToListAsync();

        var queuePositions = BuildHangfireQueuePositions();

        return new AnalysisJobsOverviewDto
        {
            Active = activeJobs.Select(job => MapJob(job, queuePositions)).ToList(),
            Recent = recentJobs.Select(job => MapJob(job, queuePositions)).ToList(),
        };
    }

    private AnalysisJobQueueItemDto MapJob(AnalysisJob job, IReadOnlyDictionary<string, int> queuePositions)
    {
        var hasPartial = _resultService.HasPartialResult(job.Id);
        return new()
        {
            Id = job.Id,
            Status = job.Status,
            Progress = job.Progress,
            Database = job.Database,
            Schema = job.Schema,
            Table = job.Table,
            SourceKind = ResolveSourceKind(job),
            StartDate = job.StartDate,
            EndDate = job.EndDate,
            Granularity = job.Granularity,
            CreatedAt = job.CreatedAt,
            CompletedAt = job.CompletedAt,
            TimeColumn = job.TimeColumn,
            CustomMinutes = job.CustomMinutes,
            ChannelId = ResolveChannelId(job),
            QueuePosition = job.Status == AnalysisJobStatus.Pending
                ? TryGetQueuePosition(job.BackgroundJobId, queuePositions)
                : null,
            HasPartialResult = hasPartial,
            HasResult = _resultService.HasResult(job),
            CanResume = AnalysisJobResumeRules.CanResume(job, hasPartial),
            CompletedBatchCount = job.CompletedBatchCount,
            TotalBatchCount = job.TotalBatchCount,
            AvgBatchDurationMs = job.AvgBatchDurationMs,
            LastBatchDurationMs = job.LastBatchDurationMs,
            PostProcessDurationMs = job.PostProcessDurationMs,
        };
    }

    public async Task<bool> TryCancelAsync(string jobId)
    {
        var job = await _db.AnalysisJobs.FindAsync(jobId);
        if (job == null)
            return false;

        if (job.Status is AnalysisJobStatus.Completed or AnalysisJobStatus.Failed or AnalysisJobStatus.Cancelled)
            return false;

        _cancellation.StopAndDetach(job);

        if (job.Status == AnalysisJobStatus.Pending)
            await MarkCancelledAsync(job);

        return true;
    }

    public async Task MarkCancelledAsync(AnalysisJob job)
    {
        if (!await _db.AnalysisJobs.AsNoTracking().AnyAsync(j => j.Id == job.Id))
            return;

        job.Status = AnalysisJobStatus.Cancelled;
        job.ErrorMessage = "Задача отменена пользователем.";
        job.CompletedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
    }

    public async Task<(bool Ok, string? Error)> TryResumeAsync(string jobId, string sessionToken)
    {
        if (string.IsNullOrWhiteSpace(sessionToken))
            return (false, "Нет активной сессии. Подключитесь к БД и повторите resume.");

        var job = await _db.AnalysisJobs.FindAsync(jobId);
        if (job == null)
            return (false, "Задача не найдена.");

        if (job.Status is AnalysisJobStatus.Completed or AnalysisJobStatus.Cancelled or AnalysisJobStatus.Running)
            return (false, "Задачу нельзя возобновить в текущем статусе.");

        if (!AnalysisJobResumeRules.CanResume(job, _resultService.HasPartialResult(job.Id)))
            return (false, "Нет сохранённого прогресса для продолжения. Запустите анализ заново.");

        var connectionInfo = _connectionManager.GetConnectionInfo(sessionToken);
        if (connectionInfo == null)
            return (false, "Нет активной сессии. Подключитесь к БД и повторите resume.");

        if (!ConnectionFingerprint.Matches(job.ConnectionFingerprint, connectionInfo.Provider, connectionInfo.ConnectionString))
            return (false, "Текущее подключение не совпадает с сервером, на котором запускался анализ. Подключитесь к тому же хосту и пользователю.");

        _cancellation.DetachHangfire(job);

        job.Status = AnalysisJobStatus.Pending;
        job.ErrorMessage = null;
        job.CompletedAt = null;

        var hangfireId = string.IsNullOrEmpty(job.SourceId)
            ? _backgroundJobClient.Enqueue<AnalysisJobProcessor>(p => p.ProcessJobAsync(job.Id, sessionToken))
            : _backgroundJobClient.Enqueue<AnalysisJobProcessor>(p => p.ProcessSourceJobAsync(job.Id, job.SourceId, sessionToken));

        job.BackgroundJobId = hangfireId;
        await _db.SaveChangesAsync();
        return (true, null);
    }

    private static AnalysisSourceKind ResolveSourceKind(AnalysisJob job) =>
        job.Schema switch
        {
            "dbo" => AnalysisSourceKind.dbo,
            "em_protocol" => AnalysisSourceKind.em_protocol,
            _ => AnalysisSourceKind.generic,
        };

    private static string? ResolveChannelId(AnalysisJob job) =>
        job.Schema is "dbo" or "em_protocol"
        && !string.Equals(job.Table, "All", StringComparison.OrdinalIgnoreCase)
            ? job.Table
            : null;

    private static Dictionary<string, int> BuildHangfireQueuePositions()
    {
        var positions = new Dictionary<string, int>(StringComparer.Ordinal);
        try
        {
            var monitor = JobStorage.Current.GetMonitoringApi();
            var position = 0;
            foreach (var queue in monitor.Queues())
            {
                var enqueued = monitor.EnqueuedJobs(queue.Name, 0, 200);
                foreach (var entry in enqueued)
                {
                    position++;
                    positions[entry.Key] = position;
                }
            }
        }
        catch
        {
        }

        return positions;
    }

    private static int? TryGetQueuePosition(string? backgroundJobId, IReadOnlyDictionary<string, int> positions)
    {
        if (string.IsNullOrEmpty(backgroundJobId))
            return null;

        return positions.TryGetValue(backgroundJobId, out var position) ? position : null;
    }
}
