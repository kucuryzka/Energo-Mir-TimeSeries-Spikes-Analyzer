using Microsoft.EntityFrameworkCore;
using API.Models;

namespace API.Data;

public class InternalDbContext : DbContext
{
    public InternalDbContext(DbContextOptions<InternalDbContext> options) : base(options)
    {
    }

    public DbSet<AnalysisJob> AnalysisJobs { get; set; } = null!;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        
        modelBuilder.Entity<AnalysisJob>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Status).IsRequired().HasMaxLength(50);
            entity.Property(e => e.Database).IsRequired().HasMaxLength(200);
            entity.Property(e => e.Schema).IsRequired().HasMaxLength(200);
            entity.Property(e => e.Table).IsRequired().HasMaxLength(200);
            entity.Property(e => e.TimeColumn).IsRequired().HasMaxLength(200);
        });
    }
}
