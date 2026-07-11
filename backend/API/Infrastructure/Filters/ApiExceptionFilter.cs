using System.Data.Common;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace API.Infrastructure.Filters;

public sealed class ApiExceptionFilter : IExceptionFilter
{
    private readonly IHostEnvironment _environment;
    private readonly ILogger<ApiExceptionFilter> _logger;

    public ApiExceptionFilter(IHostEnvironment environment, ILogger<ApiExceptionFilter> logger)
    {
        _environment = environment;
        _logger = logger;
    }

    public void OnException(ExceptionContext context)
    {
        if (context.ExceptionHandled)
            return;

        if (context.Exception is OperationCanceledException)
            return;

        var ex = context.Exception;
        context.Result = ex switch
        {
            UnauthorizedAccessException u => Error(StatusCodes.Status401Unauthorized, u.Message),
            ArgumentException a => Error(StatusCodes.Status400BadRequest, a.Message),
            NotSupportedException n => Error(StatusCodes.Status400BadRequest, n.Message),
            InvalidDataException d => Error(StatusCodes.Status400BadRequest, d.Message),
            DbException db => Error(StatusCodes.Status400BadRequest, db.Message),
            FileNotFoundException f => Error(StatusCodes.Status404NotFound, f.Message),
            _ => CreateServerError(ex)
        };
        context.ExceptionHandled = true;
    }

    private ObjectResult CreateServerError(Exception ex)
    {
        _logger.LogError(ex, "Unhandled exception");
        if (_environment.IsDevelopment())
            return Error(StatusCodes.Status500InternalServerError, "An unexpected error occurred.", ex.Message);

        return Error(StatusCodes.Status500InternalServerError, "An unexpected error occurred.");
    }

    private static ObjectResult Error(int statusCode, string message, string? details = null)
    {
        object body = details is null
            ? new { message }
            : new { message, details };
        return new ObjectResult(body) { StatusCode = statusCode };
    }
}
