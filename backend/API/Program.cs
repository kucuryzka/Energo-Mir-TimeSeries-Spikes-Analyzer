using API.Configuration;
using API.Contracts;
using API.Data;
using API.Infrastructure;
using API.Services;
using Hangfire;
using Hangfire.Storage.SQLite;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<AnalysisSettings>(
    builder.Configuration.GetSection(AnalysisSettings.SectionName));
builder.Services.Configure<HangfireSettings>(
    builder.Configuration.GetSection(HangfireSettings.SectionName));
var analysisSettings = builder.Configuration
    .GetSection(AnalysisSettings.SectionName)
    .Get<AnalysisSettings>() ?? new AnalysisSettings();
var hangfireSettings = builder.Configuration
    .GetSection(HangfireSettings.SectionName)
    .Get<HangfireSettings>() ?? new HangfireSettings();
var fileLogSettings = builder.Configuration
    .GetSection(LoggingSettings.SectionName)
    .Get<LoggingSettings>() ?? new LoggingSettings();

if (fileLogSettings.Enabled)
{
    var logDirectory = Path.IsPathRooted(fileLogSettings.Directory)
        ? fileLogSettings.Directory
        : Path.Combine(builder.Environment.ContentRootPath, fileLogSettings.Directory);
    var minLevel = Enum.TryParse<LogLevel>(fileLogSettings.MinLevel, ignoreCase: true, out var parsed)
        ? parsed
        : LogLevel.Information;
    builder.Logging.AddProvider(new FileLoggerProvider(logDirectory, minLevel));
}

builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedPrefix;
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
    });
builder.Services.AddHttpContextAccessor();

builder.Services.AddDbContext<InternalDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("InternalConnection")));

builder.Services.AddHangfire(configuration => configuration
    .SetDataCompatibilityLevel(CompatibilityLevel.Version_180)
    .UseSimpleAssemblyNameTypeSerializer()
    .UseRecommendedSerializerSettings()
    .UseSQLiteStorage(builder.Configuration.GetConnectionString("InternalConnection"), new SQLiteStorageOptions
    {
        QueuePollInterval = TimeSpan.FromSeconds(1),
        InvisibilityTimeout = TimeSpan.FromHours(
            Math.Clamp(analysisSettings.HangfireJobInvisibilityTimeoutHours, 1, 24))
    }));

builder.Services.AddHangfireServer(options =>
{
    options.WorkerCount = analysisSettings.HangfireWorkerCount;
    options.SchedulePollingInterval = TimeSpan.FromSeconds(1);
    options.ServerCheckInterval = TimeSpan.FromSeconds(5);
});

builder.Services.AddSingleton<API.Sql.ISqlDialectProvider, API.Sql.SqlDialectProvider>();
builder.Services.AddSingleton<API.Services.IDatabaseContextFactory, API.Services.DatabaseContextFactory>();
builder.Services.AddScoped<AnalysisPipelineService>();

builder.Services.AddScoped<Core.Interfaces.ISpikeDetectionService, Core.Services.SpikeDetectionService>();
builder.Services.AddSingleton<IConnectionManagerService, ConnectionManagerService>();
builder.Services.AddScoped<SessionContextService>();
builder.Services.AddScoped<DataSourceConnectionResolver>();
builder.Services.AddSingleton<AnalysisResultService>();
builder.Services.AddSingleton<EventCodeLabelService>();
builder.Services.AddScoped<ExcelReportService>();
builder.Services.AddScoped<AnalysisExportService>();
builder.Services.AddScoped<TablePreviewService>();
builder.Services.AddScoped<AnalysisRequestValidator>();
builder.Services.AddScoped<AnalysisJobQueryService>();
builder.Services.AddSingleton<API.Services.IAnalysisJobCancellationService, API.Services.AnalysisJobCancellationService>();
builder.Services.AddScoped<API.Services.AnalysisJobCoordinatorService>();
builder.Services.AddScoped<API.Services.AnalysisTimingStatsService>();

builder.Services.AddScoped<API.DataSources.IDataSourceStrategy, API.DataSources.EmProtocolDataSource>();
builder.Services.AddScoped<API.DataSources.IDataSourceStrategy, API.DataSources.DboDataSource>();
builder.Services.AddHostedService<API.Services.StaleAnalysisJobCleanup>();

builder.Services.AddCors(options =>
{
    options.AddPolicy("ReactCorsPolicy", policy =>
    {
        policy.WithOrigins("http://localhost:5173", "http://localhost:3000", "http://localhost")
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("ReactCorsPolicy");
app.UseForwardedHeaders();

using (var scope = app.Services.CreateScope())
{
    var internalDb = scope.ServiceProvider.GetRequiredService<InternalDbContext>();
    InternalDbSchemaUpdater.Apply(internalDb);
}

var dashboardPrefix = hangfireSettings.DashboardPrefixPath.TrimEnd('/');
var dashboardPath = string.IsNullOrEmpty(dashboardPrefix)
    ? "/hangfire"
    : $"{dashboardPrefix}/hangfire";

// Старый nginx: proxy_pass .../hangfire/ — переписываем на публичный путь dashboard.
if (!dashboardPath.Equals("/hangfire", StringComparison.OrdinalIgnoreCase))
{
    app.Use(async (context, next) =>
    {
        if (context.Request.Path.StartsWithSegments("/hangfire", out var remainder))
            context.Request.Path = new PathString(dashboardPath) + remainder;
        await next();
    });
}

app.UseHangfireDashboard(dashboardPath, new DashboardOptions
{
    Authorization = [new API.Infrastructure.HangfireDashboardAuthorizationFilter()]
});

if (app.Environment.IsProduction())
    app.UseHttpsRedirection();
app.UseAuthorization();
app.MapControllers();

app.Run();
