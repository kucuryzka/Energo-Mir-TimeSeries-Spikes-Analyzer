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

        return IsLocalhostClient(http);
    }

    private static bool IsLocalhostClient(HttpContext http)
    {
        var clientIp = GetClientIp(http);
        if (string.IsNullOrEmpty(clientIp))
            return false;

        if (!IPAddress.TryParse(clientIp, out var address))
            return false;

        return IPAddress.IsLoopback(address);
    }

    private static string? GetClientIp(HttpContext http)
    {
        var forwarded = http.Request.Headers["X-Forwarded-For"].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(forwarded))
            return forwarded.Split(',')[0].Trim();

        return http.Connection.RemoteIpAddress?.MapToIPv4().ToString()
            ?? http.Connection.RemoteIpAddress?.ToString();
    }
}
