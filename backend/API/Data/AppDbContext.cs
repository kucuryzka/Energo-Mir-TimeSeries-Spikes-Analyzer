using Microsoft.EntityFrameworkCore;
using Core.Models;

namespace API.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
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
