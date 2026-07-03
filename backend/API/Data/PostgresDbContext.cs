using Microsoft.EntityFrameworkCore;
using Core.Models;

namespace API.Data;

public class PostgresDbContext : DbContext
{
    public PostgresDbContext(DbContextOptions<PostgresDbContext> options) : base(options)
    {
    }

    public DbSet<Record> Records { get; set; } = null!;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Record>(entity =>
        {
            entity.ToTable("Records", "em_protocol");
            entity.HasNoKey();
            entity.Ignore(e => e.Id);
            entity.Property(e => e.EventTime).HasColumnName("EventTime").IsRequired();
            entity.Property(e => e.ChannelId).HasColumnName("ChannelId").IsRequired();
        });
    }
}
