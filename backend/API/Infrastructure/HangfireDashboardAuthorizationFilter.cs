using System.Net;
using Hangfire.Dashboard;

namespace API.Infrastructure;

public class HangfireDashboardAuthorizationFilter : IDashboardAuthorizationFilter
{
    public bool Authorize(DashboardContext context)
    {
        var http = context.GetHttpContext();
        var env = http.RequestServices.GetRequiredService<IWebHostEnvironment>();

        if (env.IsDevelopment())
            return true;

        var remote = http.Connection.RemoteIpAddress;
        return remote != null && IPAddress.IsLoopback(remote);
    }
}
