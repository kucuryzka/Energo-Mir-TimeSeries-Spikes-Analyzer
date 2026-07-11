using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace API.Infrastructure.Filters;

public sealed class RequireSessionFilter : IAsyncActionFilter
{
    private readonly SessionContextService _session;

    public RequireSessionFilter(SessionContextService session)
    {
        _session = session;
    }

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var allowAnonymous = context.ActionDescriptor.EndpointMetadata
            .OfType<IAllowAnonymous>()
            .Any();

        if (!allowAnonymous && !_session.IsAuthenticated())
        {
            context.Result = new UnauthorizedObjectResult(new { message = "Invalid or missing session token" });
            return;
        }

        await next();
    }
}
