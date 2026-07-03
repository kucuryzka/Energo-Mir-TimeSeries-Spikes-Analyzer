using Microsoft.EntityFrameworkCore;
using API.Data;
using API.DataSources;

namespace API.Configuration;

public static class DataSourceRegistration
{
    public static void RegisterDataSources(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddSingleton<ISqlDialect, SqlServerDialect>();
        services.AddSingleton<PostgreSqlDialect>();

        services.AddScoped<IDataSourceStrategy>(sp =>
            new DboDataSource(
                sp.GetRequiredService<AppDbContext>(),
                sp.GetRequiredService<ISqlDialect>(),
                "Dbo",
                "dbo (SQL Server)"));

        services.AddScoped<IDataSourceStrategy>(sp =>
            new EmProtocolDataSource(
                sp.GetRequiredService<AppDbContext>(),
                sp.GetRequiredService<ISqlDialect>(),
                "em_protocol",
                "em_protocol (SQL Server)"));

        var postgresConnection = configuration.GetConnectionString("PostgresConnection");
        if (!string.IsNullOrWhiteSpace(postgresConnection))
        {
            services.AddDbContext<PostgresDbContext>(options =>
                options.UseNpgsql(
                    postgresConnection,
                    npgsqlOptions => npgsqlOptions.CommandTimeout(300)));

            services.AddScoped<IDataSourceStrategy>(sp =>
                new DboDataSource(
                    sp.GetRequiredService<PostgresDbContext>(),
                    sp.GetRequiredService<PostgreSqlDialect>(),
                    "postgres_dbo",
                    "dbo (PostgreSQL)"));

            services.AddScoped<IDataSourceStrategy>(sp =>
                new EmProtocolDataSource(
                    sp.GetRequiredService<PostgresDbContext>(),
                    sp.GetRequiredService<PostgreSqlDialect>(),
                    "postgres_em_protocol",
                    "em_protocol (PostgreSQL)"));
        }
    }
}
