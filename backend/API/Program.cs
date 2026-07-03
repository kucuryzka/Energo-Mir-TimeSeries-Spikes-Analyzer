using Microsoft.EntityFrameworkCore;
using API.Data;
using API.Configuration;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
    });

// Configure EF Core DbContext with SQL Server
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(
        builder.Configuration.GetConnectionString("DefaultConnection"),
        sqlServerOptionsAction: sqlOptions =>
        {
            sqlOptions.CommandTimeout(300); // 5 minutes timeout for heavy queries
        }
    ));

// Register implementations of Core interfaces
builder.Services.AddScoped<Core.Interfaces.ITimeSeriesService, Core.Services.TimeService>();
builder.Services.AddScoped<Core.Interfaces.ISpikeDetectionService, Core.Services.SpikeDetectionService>();

// Register data sources (SQL Server + optional PostgreSQL)
builder.Services.RegisterDataSources(builder.Configuration);

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

app.UseHttpsRedirection();

app.UseAuthorization();

app.MapControllers();

app.Run();
