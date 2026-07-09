using System.IO.Compression;
using System.Text;
using ClosedXML.Excel;

namespace API.Services;

// ClosedXML cannot update chart ranges; the template chart references a fixed A1:A3 range
// and plots wrong columns. Rebuild chart1.xml after data fill.
internal static class ExcelChartPatcher
{
    private const string ChartEntryPath = "xl/charts/chart1.xml";
    private const string DrawingEntryPath = "xl/drawings/drawing1.xml";

    public static byte[] Patch(byte[] workbookBytes, int lastDataRow)
    {
        if (lastDataRow < 2)
            return workbookBytes;

        var (endCol, endRow) = ResolveChartSize(lastDataRow);

        using var input = new MemoryStream(workbookBytes);
        using var output = new MemoryStream();

        using (var inputZip = new ZipArchive(input, ZipArchiveMode.Read, leaveOpen: true))
        using (var outputZip = new ZipArchive(output, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var entry in inputZip.Entries)
            {
                var newEntry = outputZip.CreateEntry(entry.FullName, CompressionLevel.Optimal);
                using var entryStream = entry.Open();
                using var newEntryStream = newEntry.Open();

                if (entry.FullName.Equals(ChartEntryPath, StringComparison.OrdinalIgnoreCase))
                {
                    var xml = BuildLineChartXml(lastDataRow);
                    newEntryStream.Write(Encoding.UTF8.GetBytes(xml));
                }
                else if (entry.FullName.Equals(DrawingEntryPath, StringComparison.OrdinalIgnoreCase))
                {
                    var xml = BuildDrawingXml(endCol, endRow);
                    newEntryStream.Write(Encoding.UTF8.GetBytes(xml));
                }
                else
                {
                    entryStream.CopyTo(newEntryStream);
                }
            }
        }

        return output.ToArray();
    }

    // Anchor span on sheet «График»: wider/taller for larger series.
    internal static (int EndCol, int EndRow) ResolveChartSize(int lastDataRow)
    {
        var pointCount = Math.Max(lastDataRow - 1, 1);
        var endCol = Math.Clamp(30 + pointCount / 8, 36, 56);
        var endRow = Math.Clamp(38 + pointCount / 18, 44, 62);
        return (endCol, endRow);
    }

    internal static void PrepareChartWorksheet(IXLWorksheet sheet, int lastDataRow)
    {
        var (endCol, endRow) = ResolveChartSize(lastDataRow);
        for (var col = 1; col <= endCol + 2; col++)
            sheet.Column(col).Width = 6.8;
        for (var row = 1; row <= endRow + 2; row++)
            sheet.Row(row).Height = 22;
    }

    private static string BuildDrawingXml(int endCol, int endRow) =>
        $"""
            <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
              <xdr:twoCellAnchor>
                <xdr:from>
                  <xdr:col>0</xdr:col>
                  <xdr:colOff>0</xdr:colOff>
                  <xdr:row>0</xdr:row>
                  <xdr:rowOff>0</xdr:rowOff>
                </xdr:from>
                <xdr:to>
                  <xdr:col>{endCol}</xdr:col>
                  <xdr:colOff>0</xdr:colOff>
                  <xdr:row>{endRow}</xdr:row>
                  <xdr:rowOff>0</xdr:rowOff>
                </xdr:to>
                <xdr:graphicFrame macro="">
                  <xdr:nvGraphicFramePr>
                    <xdr:cNvPr id="2" name="График анализа"/>
                    <xdr:cNvGraphicFramePr/>
                  </xdr:nvGraphicFramePr>
                  <xdr:xfrm>
                    <a:off x="0" y="0"/>
                    <a:ext cx="0" cy="0"/>
                  </xdr:xfrm>
                  <a:graphic>
                    <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
                      <c:chart r:id="rId1"/>
                    </a:graphicData>
                  </a:graphic>
                </xdr:graphicFrame>
                <xdr:clientData/>
              </xdr:twoCellAnchor>
            </xdr:wsDr>
            """;

    private static string BuildLineChartXml(int lastDataRow)
    {
        var xRange = $"'Данные'!$A$2:$A${lastDataRow}";
        var yRange = $"'Данные'!$B$2:$B${lastDataRow}";

        return $"""
            <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
              <c:lang val="ru-RU"/>
              <c:chart>
                <c:plotArea>
                  <c:layout/>
                  <c:lineChart>
                    <c:grouping val="standard"/>
                    <c:varyColors val="0"/>
                    <c:ser>
                      <c:idx val="0"/>
                      <c:order val="0"/>
                      <c:tx>
                        <c:v><c:str>Количество сообщений</c:str></c:v>
                      </c:tx>
                      <c:marker>
                        <c:symbol val="none"/>
                      </c:marker>
                      <c:cat>
                        <c:numRef>
                          <c:f>{xRange}</c:f>
                        </c:numRef>
                      </c:cat>
                      <c:val>
                        <c:numRef>
                          <c:f>{yRange}</c:f>
                        </c:numRef>
                      </c:val>
                      <c:smooth val="0"/>
                    </c:ser>
                    <c:marker val="1"/>
                    <c:axId val="10"/>
                    <c:axId val="20"/>
                  </c:lineChart>
                  <c:dateAx>
                    <c:axId val="10"/>
                    <c:scaling><c:orientation val="minMax"/></c:scaling>
                    <c:delete val="0"/>
                    <c:axPos val="b"/>
                    <c:numFmt formatCode="dd.mm.yyyy hh:mm" sourceLinked="1"/>
                    <c:majorTickMark val="out"/>
                    <c:minorTickMark val="none"/>
                    <c:tickLblPos val="nextTo"/>
                    <c:crossAx val="20"/>
                    <c:crosses val="autoZero"/>
                  </c:dateAx>
                  <c:valAx>
                    <c:axId val="20"/>
                    <c:scaling><c:orientation val="minMax"/></c:scaling>
                    <c:delete val="0"/>
                    <c:axPos val="l"/>
                    <c:majorGridlines/>
                    <c:numFmt formatCode="General" sourceLinked="1"/>
                    <c:majorTickMark val="out"/>
                    <c:minorTickMark val="none"/>
                    <c:tickLblPos val="nextTo"/>
                    <c:crossAx val="10"/>
                    <c:crosses val="autoZero"/>
                  </c:valAx>
                </c:plotArea>
                <c:plotVisOnly val="1"/>
                <c:dispBlanksAs val="gap"/>
              </c:chart>
            </c:chartSpace>
            """;
    }
}
