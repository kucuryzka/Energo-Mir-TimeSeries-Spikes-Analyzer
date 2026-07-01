namespace API.DTOs
{
    public class MeteringInfoDto
    {
        public int? IdObjectAggregate { get; set; }
        public int? IdObjectAverage { get; set; }
        public int? Quality { get; set; }
        public int? QualitySource { get; set; }
        public string Source { get; set; } = string.Empty;
        public double? ValueMetering { get; set; }
        public int IdObject { get; set; }
        public string ObjectName { get; set; } = string.Empty;
    }
}
