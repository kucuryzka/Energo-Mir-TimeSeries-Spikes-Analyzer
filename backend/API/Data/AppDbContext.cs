using Microsoft.EntityFrameworkCore;
using Core.Models;

namespace API.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<CallRecord> CallRecords { get; set; } = null!;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<CallRecord>(entity =>
        {
            entity.HasNoKey();
            entity.ToTable("CallRecords");
            entity.Property(e => e.Timestamp).IsRequired();
        });
    }
}
