using System.ComponentModel.DataAnnotations;
using API.Enums;

namespace API.Models;

public class SupplementJob
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();

    public SupplementJobKind Kind { get; set; }

    public AnalysisJobStatus Status { get; set; } = AnalysisJobStatus.Pending;

    public string ParentAnalysisJobId { get; set; } = string.Empty;

    public string Database { get; set; } = string.Empty;

    public string? ConnectionFingerprint { get; set; }

    public string PayloadJson { get; set; } = "{}";

    public string? ErrorMessage { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? CompletedAt { get; set; }

    public DateTime? RunningStartedAt { get; set; }

    public string? BackgroundJobId { get; set; }
}
