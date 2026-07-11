using API.Data;
using API.Models;
using Hangfire;
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
        var backgroundJobs = scope.ServiceProvider.GetRequiredService<IBackgroundJobClient>();

        var interrupted = await db.AnalysisJobs
            .Where(j => j.Status == "Running" || j.Status == "Pending")
            .ToListAsync(cancellationToken);

        var resumed = 0;
        var failed = 0;

        foreach (var job in interrupted)
        {
            if (string.IsNullOrWhiteSpace(job.ConnectionString))
            {
                job.Status = "Failed";
                job.ErrorMessage =
                    "Задача прервана из-за перезапуска сервера, и сохранённое подключение недоступно. Запустите анализ повторно.";
                job.CompletedAt = DateTime.UtcNow;
                job.ProcessedUntil = null;
                resultService.DeletePartialFile(job.Id);
                failed++;
                continue;
            }

            job.Status = "Pending";
            job.ErrorMessage = null;
            job.CompletedAt = null;

            var hangfireId = string.IsNullOrEmpty(job.SourceId)
                ? backgroundJobs.Enqueue<AnalysisJobProcessor>(p => p.ProcessJobAsync(job.Id))
                : backgroundJobs.Enqueue<AnalysisJobProcessor>(p => p.ProcessSourceJobAsync(job.Id, job.SourceId));

            job.BackgroundJobId = hangfireId;
            resumed++;
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
                "Startup cleanup: {ResumedCount} jobs requeued for resume, {FailedCount} failed (no connection), {RepairedCount} completed-without-result",
                resumed,
                failed,
                repairedCount);
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
