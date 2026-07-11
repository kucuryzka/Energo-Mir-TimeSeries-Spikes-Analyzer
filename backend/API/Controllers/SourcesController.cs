using API.Contracts;
using System.Linq;
using API.DataSources;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SourcesController : ControllerBase
{
    private readonly IEnumerable<IDataSourceStrategy> _dataSourceStrategies;

    public SourcesController(IEnumerable<IDataSourceStrategy> dataSourceStrategies)
    {
        _dataSourceStrategies = dataSourceStrategies;
    }

    [HttpGet]
    public IActionResult GetSources()
    {
        var sources = _dataSourceStrategies.Select(s => new
        {
            Id = s.Id,
            Name = s.Name,
            SupportedDistributions = s.SupportedDistributions
        }).ToList();
        return Ok(sources);
    }
}
