using API.Models;

namespace API.Services.Analysis;

public class AnalysisExportService
{
    private readonly AnalysisResultService _resultService;
    private readonly ExcelReportService _excelReport;

    public AnalysisExportService(
        AnalysisResultService resultService,
        ExcelReportService excelReport
    )
    {
        _resultService = resultService;
        _excelReport = excelReport;
    }

    public async Task<(MemoryStream Stream, string FileName)> BuildExcelAsync(
        AnalysisJob job,
        CancellationToken cancellationToken = default
    )
    {
        if (!_resultService.CanExport(job))
            throw new ArgumentException("Analysis result is not available for export.");

        var response = await _resultService.LoadAsync(job, cancellationToken);
        var bytes = _excelReport.GenerateReport(response);
        var fileName = $"spike-analysis-{DateTime.Now:yyyy-MM-dd_HHmm}.xlsx";
        var stream = new MemoryStream(bytes);
        stream.Position = 0;
        return (stream, fileName);
    }
}
