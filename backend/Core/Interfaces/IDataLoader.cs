using Core.Models;

namespace Core.Interfaces;


public interface IDataLoader
{
    IEnumerable<Record> LoadData();
}
