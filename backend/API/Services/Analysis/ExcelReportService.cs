using API.DTOs;
using ClosedXML.Excel;

namespace API.Services.Analysis;

public class ExcelReportService
{
    private readonly string _templatePath;

    public ExcelReportService(IWebHostEnvironment environment)
    {
        _templatePath = Path.Combine(
            environment.ContentRootPath,
            "Resources",
            "ReportTemplate.xlsx");
    }

    public byte[] GenerateReport(SpikeResponse response)
    {
        if (!File.Exists(_templatePath))
            throw new FileNotFoundException($"Template not found: {_templatePath}");

        using var workbook = new XLWorkbook(_templatePath);
        var dataSheet = workbook.Worksheet("Данные")
            ?? throw new InvalidOperationException("Worksheet 'Данные' not found in report template.");

        FillReport(dataSheet, response);

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return stream.ToArray();
    }

    private static void FillReport(IXLWorksheet sheet, SpikeResponse response)
    {
        var table = sheet.Tables.FirstOrDefault();
        if (table?.DataRange != null)
            table.DataRange.Clear(XLClearOptions.Contents);

        var row = 2;
        foreach (var point in response.Series)
        {
            sheet.Cell(row, 1).Value = point.Timestamp;
            sheet.Cell(row, 1).Style.DateFormat.Format = "dd.MM.yyyy HH:mm:ss";
            sheet.Cell(row, 2).Value = point.Value;
            sheet.Cell(row, 3).Value = point.IsSpike;
            sheet.Cell(row, 4).Value = point.PValue;
            sheet.Cell(row, 5).Value = point.ChannelBreakdown.Count > 0
                ? string.Join(
                    "; ",
                    point.ChannelBreakdown.Select(x =>
                        $"{(string.IsNullOrWhiteSpace(x.ChannelName) ? x.ChannelId.ToString() : x.ChannelName)}: {x.Count}"))
                : "";
            row++;
        }

        if (table != null && row > 2)
        {
            table.Resize(sheet.Range(
                table.RangeAddress.FirstAddress.RowNumber,
                table.RangeAddress.FirstAddress.ColumnNumber,
                row - 1,
                table.RangeAddress.LastAddress.ColumnNumber));
        }
    }
}
