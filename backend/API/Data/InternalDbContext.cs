using Microsoft.EntityFrameworkCore;
using API.Models;

namespace API.Data;

public class InternalDbContext : DbContext
{
    public InternalDbContext(DbContextOptions<InternalDbContext> options) : base(options)
    {
    }

    public DbSet<AnalysisJob> AnalysisJobs { get; set; } = null!;
    public DbSet<AnalysisSourceTimingStats> AnalysisSourceTimingStats { get; set; } = null!;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<AnalysisJob>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Status)
                .HasConversion<string>()
                .IsRequired()
                .HasMaxLength(50);
            entity.Property(e => e.Database).IsRequired().HasMaxLength(200);
            entity.Property(e => e.Schema).IsRequired().HasMaxLength(200);
            entity.Property(e => e.Table).IsRequired().HasMaxLength(200);
            entity.Property(e => e.TimeColumn).IsRequired().HasMaxLength(200);
        });

        modelBuilder.Entity<AnalysisSourceTimingStats>(entity =>
        {
            entity.HasKey(e => e.SourceKey);
            entity.Property(e => e.Database).HasColumnName("Database");
            entity.Property(e => e.Schema).HasColumnName("Schema");
            entity.Property(e => e.Table).HasColumnName("Table");
        });
    }
}
