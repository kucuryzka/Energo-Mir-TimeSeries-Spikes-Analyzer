using API.Configuration;
using API.Data;
using API.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace API.Services;

public interface IDatabaseContextFactory
{
    AppDbContext Create(string connectionString, string provider, string? database = null);
}

public class DatabaseContextFactory : IDatabaseContextFactory
{
    private readonly AnalysisSettings _settings;

    public DatabaseContextFactory(IOptions<AnalysisSettings> settings)
    {
        _settings = settings.Value;
    }

    public AppDbContext Create(string connectionString, string provider, string? database = null)
    {
        var targetConnStr = string.IsNullOrEmpty(database)
            ? connectionString
            : DatabaseConnectionHelper.WithDatabase(connectionString, database);
        var normalizedProvider = DatabaseProvider.Normalize(provider);
        var timeout = _settings.CommandTimeoutSeconds;

        var optionsBuilder = new DbContextOptionsBuilder<AppDbContext>();
        if (DatabaseProvider.IsPostgres(normalizedProvider))
        {
            optionsBuilder.UseNpgsql(targetConnStr, opts => opts.CommandTimeout(timeout));
        }
        else
        {
            optionsBuilder.UseSqlServer(targetConnStr, opts => opts.CommandTimeout(timeout));
        }

        var context = new AppDbContext(optionsBuilder.Options);
        context.Database.SetCommandTimeout(timeout);
        return context;
    }
}
