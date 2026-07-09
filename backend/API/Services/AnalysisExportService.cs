using API.Contracts;
using API.DataSources;
using API.DTOs;
using API.Infrastructure;
using API.Models;
using ClosedXML.Excel;

namespace API.Services;

public class AnalysisExportService
{
    private readonly AnalysisResultService _resultService;
    private readonly AnalysisPipelineService _pipeline;
    private readonly ExcelReportService _excelReport;
    private readonly DboDataSource _dboDataSource;
    private readonly EmProtocolDataSource _emDataSource;
    private readonly EventCodeLabelService _eventCodeLabels;
    private readonly IConnectionManagerService _connectionManager;
    private readonly IHttpContextAccessor _httpContextAccessor;

    public AnalysisExportService(
        AnalysisResultService resultService,
        AnalysisPipelineService pipeline,
        ExcelReportService excelReport,
        IEnumerable<IDataSourceStrategy> dataSources,
        EventCodeLabelService eventCodeLabels,
        IConnectionManagerService connectionManager,
        IHttpContextAccessor httpContextAccessor)
    {
        _resultService = resultService;
        _pipeline = pipeline;
        _excelReport = excelReport;
        _dboDataSource = dataSources.OfType<DboDataSource>().First();
        _emDataSource = dataSources.OfType<EmProtocolDataSource>().First();
        _eventCodeLabels = eventCodeLabels;
        _connectionManager = connectionManager;
        _httpContextAccessor = httpContextAccessor;
    }

    public async Task<(MemoryStream Stream, string FileName)> BuildExcelAsync(
        AnalysisJob job,
        bool loadDistribution,
        CancellationToken cancellationToken = default)
    {
        if (!_resultService.CanExport(job))
            throw new InvalidOperationException("Analysis result is not available for export.");

        using var workbook = _excelReport.OpenTemplate();
        var lastDataRow = await _excelReport.FillSeriesAsync(
            workbook,
            _resultService.EnumerateSeriesAsync(job, cancellationToken),
            cancellationToken);

        var chartSheet = workbook.Worksheets.FirstOrDefault(w => w.Name == "График");
        if (chartSheet != null)
            ExcelChartPatcher.PrepareChartWorksheet(chartSheet, lastDataRow);

        AddParametersSheet(workbook, job);

        var distribution = await ResolveDistributionAsync(job, loadDistribution, cancellationToken);
        if (distribution.Count > 0)
            AddDistributionSheet(workbook, distribution, job.Schema, _eventCodeLabels);

        var fileName = $"spike-analysis-{SanitizeFilePart(job.Database)}-{job.Id[..Math.Min(8, job.Id.Length)]}-{DateTime.UtcNow:yyyy-MM-dd_HHmm}.xlsx";
        using var tempStream = new MemoryStream();
        workbook.SaveAs(tempStream);
        var patchedBytes = ExcelChartPatcher.Patch(tempStream.ToArray(), lastDataRow);
        var stream = new MemoryStream(patchedBytes);
        stream.Position = 0;
        return (stream, fileName);
    }

    private async Task<List<ChannelContributionDto>> ResolveDistributionAsync(
        AnalysisJob job,
        bool loadDistribution,
        CancellationToken cancellationToken)
    {
        var channelId = ParseChannelFilter(job);
        if (channelId.HasValue)
            return new List<ChannelContributionDto>();

        if (!loadDistribution)
        {
            var stored = _resultService.GetStoredDistribution(job);
            if (stored.Count > 0 || !SupportsDistributionExport(job.Schema))
                return stored;
        }

        return await LoadDistributionFromSourceAsync(job, channelId, cancellationToken);
    }

    private async Task<List<ChannelContributionDto>> LoadDistributionFromSourceAsync(
        AnalysisJob job,
        int? channelId,
        CancellationToken cancellationToken)
    {
        if (job.Schema == "dbo")
        {
            return await _dboDataSource.GetObjectDistributionAsync(
                job.Database,
                job.StartDate,
                job.EndDate,
                channelId);
        }

        if (job.Schema == "em_protocol")
        {
            return await _emDataSource.GetRecordsDistributionAsync(
                job.Database,
                job.StartDate,
                job.EndDate,
                channelId,
                cancellationToken: cancellationToken);
        }

        var (connectionString, provider) = ResolveConnection();

        var genericSpec = new AnalysisTableSpec
        {
            Schema = job.Schema,
            Table = job.Table,
            TimeColumn = job.TimeColumn,
        };

        return await _pipeline.GetDistributionAsync(
            genericSpec,
            job.StartDate,
            job.EndDate,
            channelId,
            connectionString,
            provider,
            job.Database,
            cancellationToken);
    }

    private static bool SupportsDistributionExport(string schema) =>
        schema is "dbo" or "em_protocol";

    private static void AddParametersSheet(XLWorkbook workbook, AnalysisJob job)
    {
        var sheet = workbook.Worksheets.Add("Параметры");
        var rows = new (string Label, string Value)[]
        {
            ("ID задачи", job.Id),
            ("База данных", job.Database),
            ("Схема", job.Schema),
            ("Таблица / фильтр", job.Table),
            ("Колонка времени", string.IsNullOrEmpty(job.TimeColumn) ? "—" : job.TimeColumn),
            ("Период с", job.StartDate.ToString("dd.MM.yyyy HH:mm:ss")),
            ("Период по", job.EndDate.ToString("dd.MM.yyyy HH:mm:ss")),
            ("Детализация", job.Granularity.ToString()),
            ("Custom minutes", job.CustomMinutes?.ToString() ?? "—"),
            ("Confidence", job.Confidence?.ToString() ?? "—"),
            ("Window size", job.WindowSize?.ToString() ?? "—"),
            ("Статус", job.Status),
            ("Точек в серии", job.SeriesPointCount.ToString()),
            ("Создано (UTC)", job.CreatedAt.ToString("dd.MM.yyyy HH:mm:ss")),
            ("Завершено (UTC)", job.CompletedAt?.ToString("dd.MM.yyyy HH:mm:ss") ?? "—"),
        };

        for (var i = 0; i < rows.Length; i++)
        {
            sheet.Cell(i + 1, 1).Value = rows[i].Label;
            sheet.Cell(i + 1, 1).Style.Font.Bold = true;
            sheet.Cell(i + 1, 2).Value = rows[i].Value;
        }

        sheet.Columns().AdjustToContents();
    }

    private static void AddDistributionSheet(
        XLWorkbook workbook,
        List<ChannelContributionDto> distribution,
        string schema,
        EventCodeLabelService? eventCodeLabels = null)
    {
        var sheet = workbook.Worksheets.Add("Распределение");
        var isEmProtocol = schema == "em_protocol";
        var isDbo = schema == "dbo";
        var idHeader = isDbo ? "ID объекта" : "ID канала";
        var nameHeader = isDbo ? "Объект" : "Канал";
        var countColumn = isEmProtocol ? 5 : 3;

        sheet.Cell(1, 1).Value = idHeader;
        sheet.Cell(1, 2).Value = nameHeader;
        if (isEmProtocol)
        {
            sheet.Cell(1, 3).Value = "EventCode";
            sheet.Cell(1, 4).Value = "Расшифровка EventCode";
        }
        sheet.Cell(1, countColumn).Value = "Количество";
        sheet.Row(1).Style.Font.Bold = true;

        var row = 2;
        foreach (var item in distribution)
        {
            sheet.Cell(row, 1).Value = item.ChannelId;
            sheet.Cell(row, 2).Value = item.ChannelName;
            if (isEmProtocol)
            {
                sheet.Cell(row, 3).Value = item.EventCode ?? "—";
                sheet.Cell(row, 4).Value = eventCodeLabels?.ResolveLabel(item.EventCode) ?? item.EventCode ?? "—";
            }
            sheet.Cell(row, countColumn).Value = item.Count;
            row++;
        }

        sheet.Columns().AdjustToContents();
    }

    private static int? ParseChannelFilter(AnalysisJob job) =>
        job.Table != "All" && int.TryParse(job.Table, out var channelId) ? channelId : null;

    private (string ConnectionString, string Provider) ResolveConnection()
    {
        var token = _httpContextAccessor.HttpContext?.Request.Headers["X-Session-Token"].ToString();
        var info = _connectionManager.GetConnectionInfo(token ?? "");
        if (info == null)
            throw new UnauthorizedAccessException("Invalid or missing session token");
        return (info.ConnectionString, info.Provider);
    }

    private static string SanitizeFilePart(string value)
    {
        var invalid = Path.GetInvalidFileNameChars();
        return new string(value.Select(ch => invalid.Contains(ch) ? '_' : ch).ToArray());
    }
}
