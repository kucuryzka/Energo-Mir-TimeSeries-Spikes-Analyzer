using API.Configuration;
using API.Contracts;
using API.Data;
using API.DataSources;
using API.Sql;
using Hangfire;
using Hangfire.Storage.SQLite;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;

namespace API.Extensions;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddAppOptions(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<AnalysisSettings>(configuration.GetSection(AnalysisSettings.SectionName));
        services.Configure<HangfireSettings>(configuration.GetSection(HangfireSettings.SectionName));
        return services;
    }

    public static IServiceCollection AddApiPresentation(this IServiceCollection services)
    {
        services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedPrefix;
            options.KnownNetworks.Clear();
            options.KnownProxies.Clear();
        });

        services.AddScoped<RequireSessionFilter>();
        services.AddScoped<ApiExceptionFilter>();
        services.AddControllers(options =>
            {
                options.Filters.AddService<RequireSessionFilter>();
                options.Filters.AddService<ApiExceptionFilter>();
            })
            .AddJsonOptions(options =>
            {
                options.JsonSerializerOptions.Converters.Add(
                    new System.Text.Json.Serialization.JsonStringEnumConverter()
                );
            });
        services.AddHttpContextAccessor();
        services.AddEndpointsApiExplorer();
        services.AddSwaggerGen();
        return services;
    }

    public static IServiceCollection AddInternalDatabase(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<InternalDbContext>(options =>
            options.UseSqlite(configuration.GetConnectionString("InternalConnection"))
        );
        return services;
    }

    public static IServiceCollection AddHangfireStorage(
        this IServiceCollection services,
        IConfiguration configuration,
        AnalysisSettings analysisSettings
    )
    {
        var hangfireSqlitePath = new Microsoft.Data.Sqlite.SqliteConnectionStringBuilder(
            configuration.GetConnectionString("HangfireConnection")
            ?? configuration.GetConnectionString("InternalConnection")
            ?? "Data Source=hangfire.db"
        )
            .DataSource;

        services.AddHangfire(configurationBuilder => configurationBuilder
            .SetDataCompatibilityLevel(CompatibilityLevel.Version_180)
            .UseSimpleAssemblyNameTypeSerializer()
            .UseRecommendedSerializerSettings()
            .UseSQLiteStorage(hangfireSqlitePath, new SQLiteStorageOptions
            {
                QueuePollInterval = TimeSpan.FromSeconds(1),
                InvisibilityTimeout = TimeSpan.FromHours(
                    Math.Clamp(analysisSettings.HangfireJobInvisibilityTimeoutHours, 1, 90 * 24)
                )
            })
        );

        services.AddHangfireServer(options =>
        {
            options.WorkerCount = analysisSettings.HangfireWorkerCount;
            options.SchedulePollingInterval = TimeSpan.FromSeconds(1);
            options.ServerCheckInterval = TimeSpan.FromSeconds(5);
        });

        return services;
    }

    public static IServiceCollection AddApplicationServices(this IServiceCollection services)
    {
        services.AddSingleton<ISqlDialectProvider, SqlDialectProvider>();
        services.AddScoped<AnalysisPipelineService>();

        services.AddScoped<Core.Interfaces.ISpikeDetectionService, Core.Services.SpikeDetectionService>();
        services.AddSingleton<IConnectionManagerService, ConnectionManagerService>();
        services.AddScoped<SessionContextService>();
        services.AddSingleton<AnalysisResultService>();
        services.AddScoped<ExcelReportService>();
        services.AddScoped<AnalysisExportService>();
        services.AddScoped<TablePreviewService>();
        services.AddScoped<DatabaseCatalogService>();
        services.AddScoped<GenericTableQueryService>();
        services.AddScoped<AnalysisRequestValidator>();
        services.AddScoped<AnalysisJobQueryService>();
        services.AddSingleton<IAnalysisJobCancellationService, AnalysisJobCancellationService>();
        services.AddScoped<AnalysisJobCoordinatorService>();
        services.AddScoped<AnalysisJobProcessor>();
        services.AddScoped<AnalysisTimingStatsService>();

        services.AddScoped<EmProtocolDataSource>();
        services.AddScoped<DboDataSource>();
        services.AddScoped<IDataSourceStrategy>(sp => sp.GetRequiredService<EmProtocolDataSource>());
        services.AddScoped<IDataSourceStrategy>(sp => sp.GetRequiredService<DboDataSource>());
        services.AddHostedService<BackgroundServices.StaleAnalysisJobCleanup>();

        return services;
    }

    public static IServiceCollection AddAppCors(this IServiceCollection services, CorsSettings corsSettings)
    {
        services.AddCors(options =>
        {
            options.AddPolicy("ReactCorsPolicy", policy =>
            {
                policy.WithOrigins(corsSettings.AllowedOrigins)
                    .AllowAnyHeader()
                    .AllowAnyMethod();
            });
        });
        return services;
    }
}
