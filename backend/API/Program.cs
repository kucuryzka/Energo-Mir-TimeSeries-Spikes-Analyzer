using API.Configuration;
using API.Data;
using API.Extensions;
using Hangfire;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddAppOptions(builder.Configuration);

var analysisSettings = builder.Configuration
    .GetSection(AnalysisSettings.SectionName)
    .Get<AnalysisSettings>() ?? new AnalysisSettings();
var hangfireSettings = builder.Configuration
    .GetSection(HangfireSettings.SectionName)
    .Get<HangfireSettings>() ?? new HangfireSettings();
var corsSettings = builder.Configuration
    .GetSection(CorsSettings.SectionName)
    .Get<CorsSettings>() ?? new CorsSettings();
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

builder.Services
    .AddApiPresentation()
    .AddInternalDatabase(builder.Configuration)
    .AddHangfireStorage(builder.Configuration, analysisSettings)
    .AddApplicationServices()
    .AddAppCors(corsSettings);

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

if (!dashboardPath.Equals("/hangfire", StringComparison.OrdinalIgnoreCase))
{
    app.Use(async (context, next) =>
    {
        if (context.Request.Path.StartsWithSegments("/hangfire", out var remainder))
            context.Request.Path = new PathString(dashboardPath) + remainder;
        await next();
    }
    );
}

app.UseHangfireDashboard(dashboardPath, new DashboardOptions
{
    Authorization = [new HangfireDashboardAuthorizationFilter()]
}
);

if (app.Environment.IsProduction())
    app.UseHttpsRedirection();
app.UseAuthorization();
app.MapControllers();

app.Run();
