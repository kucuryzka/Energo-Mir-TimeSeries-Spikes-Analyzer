using Hangfire.Dashboard;

namespace API.Infrastructure;

public class HangfireDashboardAuthorizationFilter : IDashboardAuthorizationFilter
{
    public bool Authorize(DashboardContext context)
    {
        var env = context.GetHttpContext().RequestServices
            .GetRequiredService<IWebHostEnvironment>();
        return env.IsDevelopment();
    }
}
