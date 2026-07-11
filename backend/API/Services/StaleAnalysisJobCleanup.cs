using API.Data;
using Microsoft.EntityFrameworkCore;

namespace API.Services;

public class StaleAnalysisJobCleanup : IHostedService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<StaleAnalysisJobCleanup> _logger;

    public StaleAnalysisJobCleanup(
        IServiceScopeFactory scopeFactory,
        ILogger<StaleAnalysisJobCleanup> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<InternalDbContext>();
        var resultService = scope.ServiceProvider.GetRequiredService<AnalysisResultService>();

        var interrupted = await db.AnalysisJobs
            .Where(j => j.Status == "Running" || j.Status == "Pending")
            .ToListAsync(cancellationToken);

        var awaitingResume = 0;
        var failed = 0;

        foreach (var job in interrupted)
        {
            var hasCheckpoint = job.ProcessedUntil.HasValue && resultService.HasPartialResult(job.Id);
            job.Status = "Failed";
            job.CompletedAt = DateTime.UtcNow;
            job.BackgroundJobId = null;

            if (hasCheckpoint)
            {
                job.ErrorMessage =
                    "Задача прервана из-за перезапуска сервера. Подключитесь к БД и продолжите анализ (resume).";
                awaitingResume++;
            }
            else
            {
                job.ErrorMessage =
                    "Задача прервана из-за перезапуска сервера. Запустите анализ повторно.";
                job.ProcessedUntil = null;
                resultService.DeletePartialFile(job.Id);
                failed++;
            }
        }

        var completedWithoutResult = await db.AnalysisJobs
            .Where(j => j.Status == "Completed")
            .ToListAsync(cancellationToken);

        var repairedCount = 0;
        foreach (var job in completedWithoutResult)
        {
            if (!resultService.HasResult(job))
            {
                job.Status = "Failed";
                job.ErrorMessage = "Результат анализа недоступен (файл отсутствует). Запустите анализ повторно.";
                job.CompletedAt ??= DateTime.UtcNow;
                repairedCount++;
            }
        }

        if (interrupted.Count > 0 || repairedCount > 0)
        {
            await db.SaveChangesAsync(cancellationToken);
            _logger.LogInformation(
                "Startup cleanup: {AwaitingResume} interrupted with checkpoint, {FailedCount} without checkpoint, {RepairedCount} completed-without-result",
                awaitingResume,
                failed,
                repairedCount);
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
