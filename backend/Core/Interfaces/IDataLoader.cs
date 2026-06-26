using Core.Models;

namespace Core.Interfaces;


public interface IDataLoader
{
    IEnumerable<CallRecord> LoadData();
}
