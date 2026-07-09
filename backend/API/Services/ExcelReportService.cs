using API.DTOs;
using ClosedXML.Excel;

namespace API.Services;

public class ExcelReportService
{
    private readonly string _templatePath;

    public ExcelReportService(IWebHostEnvironment environment)
    {
        _templatePath = Path.Combine(environment.ContentRootPath, "Resources", "ReportTemplate.xlsx");
    }

    public XLWorkbook OpenTemplate()
    {
        if (!File.Exists(_templatePath))
            throw new FileNotFoundException($"Excel template not found: {_templatePath}");

        return new XLWorkbook(_templatePath);
    }

    public async Task<int> FillSeriesAsync(
        XLWorkbook workbook,
        IAsyncEnumerable<AnomalyResultDto> series,
        CancellationToken cancellationToken = default)
    {
        var sheet = workbook.Worksheet("Данные")
            ?? throw new InvalidOperationException("Worksheet 'Данные' not found in report template.");

        var table = sheet.Tables.FirstOrDefault();
        if (table?.DataRange != null)
            table.DataRange.Clear(XLClearOptions.Contents);

        var row = 2;
        await foreach (var point in series.WithCancellation(cancellationToken))
        {
            sheet.Cell(row, 1).Value = point.Timestamp;
            sheet.Cell(row, 1).Style.DateFormat.Format = "dd.MM.yyyy HH:mm:ss";
            sheet.Cell(row, 2).Value = point.Value;
            sheet.Cell(row, 3).Value = point.IsSpike;
            sheet.Cell(row, 4).Value = point.PValue;
            sheet.Cell(row, 5).Value = FormatBreakdown(point.ChannelBreakdown);
            row++;
        }

        var lastDataRow = row - 1;

        if (table != null && lastDataRow >= 2)
        {
            table.Resize(sheet.Range(
                table.RangeAddress.FirstAddress.RowNumber,
                table.RangeAddress.FirstAddress.ColumnNumber,
                lastDataRow,
                table.RangeAddress.LastAddress.ColumnNumber));
        }

        return lastDataRow;
    }

    private static string FormatBreakdown(IEnumerable<ChannelContributionDto> breakdown)
    {
        var parts = breakdown
            .Select(cb =>
            {
                var name = cb.ChannelName;
                if (string.IsNullOrWhiteSpace(name) || name.Trim() == cb.ChannelId.ToString())
                    name = cb.ChannelId.ToString();
                return $"{name}: {cb.Count}";
            })
            .ToList();
        return parts.Count == 0 ? "" : string.Join("; ", parts);
    }
}
