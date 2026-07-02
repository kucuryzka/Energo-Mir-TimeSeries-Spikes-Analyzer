using Microsoft.EntityFrameworkCore;
using API.Data;
using Hangfire;
using Hangfire.Storage.SQLite;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
    });
builder.Services.AddHttpContextAccessor();

// Configure EF Core DbContext with SQL Server
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(
        builder.Configuration.GetConnectionString("DefaultConnection"),
        sqlServerOptionsAction: sqlOptions =>
        {
            sqlOptions.CommandTimeout(300); // 5 minutes timeout for heavy queries
        }
    ));

// Configure Internal DB Context for Hangfire and Jobs
builder.Services.AddDbContext<InternalDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("InternalConnection")));

// Configure Hangfire
builder.Services.AddHangfire(configuration => configuration
    .SetDataCompatibilityLevel(CompatibilityLevel.Version_180)
    .UseSimpleAssemblyNameTypeSerializer()
    .UseRecommendedSerializerSettings()
    .UseSQLiteStorage(builder.Configuration.GetConnectionString("InternalConnection"), new SQLiteStorageOptions
    {
        QueuePollInterval = TimeSpan.FromSeconds(1)
    }));

builder.Services.AddHangfireServer(options =>
{
    options.SchedulePollingInterval = TimeSpan.FromSeconds(1);
    options.ServerCheckInterval = TimeSpan.FromSeconds(2);
});

// Register implementations of Core interfaces
builder.Services.AddScoped<Core.Interfaces.ITimeSeriesService, Core.Services.TimeService>();
builder.Services.AddScoped<Core.Interfaces.ISpikeDetectionService, Core.Services.SpikeDetectionService>();

// Register Connection Manager
builder.Services.AddSingleton<API.Services.IConnectionManagerService, API.Services.ConnectionManagerService>();

// Register background job processor
builder.Services.AddScoped<API.Services.AnalysisJobProcessor>();

// Register data sources
builder.Services.AddScoped<API.DataSources.IDataSourceStrategy, API.DataSources.EmProtocolDataSource>();
builder.Services.AddScoped<API.DataSources.IDataSourceStrategy, API.DataSources.DboDataSource>();

// Configure CORS for React client integration
builder.Services.AddCors(options =>
{
    options.AddPolicy("ReactCorsPolicy", policy =>
    {
        policy.WithOrigins("http://localhost:5173", "http://localhost:3000") // Vite or Create-React-App default ports
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

// Configure Swagger/OpenAPI
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("ReactCorsPolicy");

// Ensure Internal DB is created
using (var scope = app.Services.CreateScope())
{
    var internalDb = scope.ServiceProvider.GetRequiredService<InternalDbContext>();
    internalDb.Database.EnsureCreated();
}

app.UseHangfireDashboard(); // Available at /hangfire

app.UseHttpsRedirection();

app.UseAuthorization();

app.MapControllers();

app.Run();
