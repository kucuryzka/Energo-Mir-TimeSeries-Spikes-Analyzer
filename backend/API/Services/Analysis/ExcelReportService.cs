using API.DTOs;
using OfficeOpenXml;
using OfficeOpenXml.Drawing.Chart;

namespace API.Services;

public class ExcelReportService
{
    private readonly string _templatePath;

    public ExcelReportService(IWebHostEnvironment env)
    {
        ExcelPackage.License.SetNonCommercialPersonal("Diploma");

        _templatePath = Path.Combine(
            env.ContentRootPath,
            "Resources",
            "ReportTemplate.xlsx");
    }

    public byte[] GenerateReport(SpikeResponse response)
    {
        if (!File.Exists(_templatePath))
            throw new FileNotFoundException(_templatePath);

        using var package = new ExcelPackage(new FileInfo(_templatePath));

        var dataSheet = package.Workbook.Worksheets["Данные"];
        var chartSheet = package.Workbook.Worksheets["График"];

        FillReport(dataSheet, response);

        CreateChart(chartSheet, response.Series.Count);

        return package.GetAsByteArray();
    }

    private static void FillReport(ExcelWorksheet sheet, SpikeResponse response)
    {
        if (sheet.Dimension != null && sheet.Dimension.End.Row >= 2)
        {
            sheet.Cells[
                2,
                1,
                sheet.Dimension.End.Row,
                sheet.Dimension.End.Column
            ].Clear();
        }

        int row = 2;

        foreach (var point in response.Series)
        {
            sheet.Cells[row, 1].Value = point.Timestamp;
            sheet.Cells[row, 1].Style.Numberformat.Format =
                "dd.MM.yyyy HH:mm:ss";

            sheet.Cells[row, 2].Value = point.Value;

            sheet.Cells[row, 3].Value = point.IsSpike;

            sheet.Cells[row, 4].Value = point.PValue;

            sheet.Cells[row, 5].Value =
                point.ChannelBreakdown.Any()
                    ? string.Join(
                        "; ",
                        point.ChannelBreakdown.Select(x =>
                            $"{(string.IsNullOrWhiteSpace(x.ChannelName)
                                ? x.ChannelId.ToString()
                                : x.ChannelName)}: {x.Count}")
                    )
                    : "";

            row++;
        }
    }

    private static void CreateChart(
        ExcelWorksheet sheet,
        int pointCount)
    {
        foreach (var drawing in sheet.Drawings.ToList())
            sheet.Drawings.Remove(drawing);

        var chart = sheet.Drawings.AddChart(
            "SpikeChart",
            eChartType.LineMarkers);

        chart.Title.Text = "Количество сообщений";

        chart.SetPosition(1, 0, 1, 0);

        chart.SetSize(1000, 500);

        var lastRow = pointCount + 1;

        var series = chart.Series.Add(
            $"Данные!$B$2:$B${lastRow}",
            $"Данные!$A$2:$A${lastRow}");

        series.Header = "Количество";

        chart.XAxis.Title.Text = "Время";

        chart.YAxis.Title.Text = "Количество";
    }
}