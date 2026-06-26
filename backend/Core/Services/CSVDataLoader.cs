using Core.Models;
using Core.Interfaces;
using Sep;
using nietras.SeparatedValues;
using Microsoft.VisualBasic;

namespace Core.Services;


public class CSVDataLoader : IDataLoader
{
    public var _file = null;

    public CSVDataLoader(var file)
    {
        _file = file;
    }

    IEnumerable<CallRecord> LoadData()
    {
        using var reader = Sep.New(',').Reader().FromFile(_file);

        if (!reader.HasHeader)
        {
            throw new InvalidOperationException("CSV файл не содержит заголовков");
        }
        
        foreach (var row in reader)
        {
            yield return new CallRecord
            {
                Timestamp = DateTime.Parse(row["Timestamp"].Span),
                UserId = row["UserId"].ToString(),
                CallType = row["CallType"].ToString(),
                DurationSeconds = row["DurationSeconds"].Parse<int>()
            };
        }
    }
}
