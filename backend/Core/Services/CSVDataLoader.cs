using Core.Models;
using Core.Interfaces;
using nietras.SeparatedValues;
using Microsoft.VisualBasic;
using System;

namespace Core.Services;


public class CSVDataLoader : IDataLoader
{
    private string _file = null;

    public CSVDataLoader(string file)
    {
        _file = file;
    }

    public IEnumerable<Record> LoadData()
    {
        using var reader = Sep.New(',').Reader().FromFile(_file);

        if (!reader.HasHeader)
        {
            throw new InvalidOperationException("CSV файл не содержит заголовков");
        }
        
        foreach (var row in reader)
        {
            yield return new Record
            {
                Id = int.Parse(row["Id"].Span),
                ChannelId = int.Parse(row["ChannelId"].Span),
                EventTime = DateTime.Parse(row["EventTime"].Span),
            };
        }
    }
}
