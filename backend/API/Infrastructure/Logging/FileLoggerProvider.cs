using System.Collections.Concurrent;
using System.Text;
using Microsoft.Extensions.Logging;

namespace API.Infrastructure.Logging;

public sealed class FileLoggerProvider : ILoggerProvider
{
    private readonly string _directory;
    private readonly LogLevel _minLevel;
    private readonly ConcurrentDictionary<string, FileLogger> _loggers = new(StringComparer.Ordinal);
    private readonly object _writeLock = new();

    public FileLoggerProvider(string directory, LogLevel minLevel = LogLevel.Information)
    {
        _directory = directory;
        _minLevel = minLevel;
        Directory.CreateDirectory(_directory);
    }

    public ILogger CreateLogger(string categoryName) =>
        _loggers.GetOrAdd(categoryName, name => new FileLogger(name, _directory, _minLevel, _writeLock));

    public void Dispose()
    {
        _loggers.Clear();
    }

    private sealed class FileLogger : ILogger
    {
        private readonly string _category;
        private readonly string _directory;
        private readonly LogLevel _minLevel;
        private readonly object _writeLock;

        public FileLogger(string category, string directory, LogLevel minLevel, object writeLock)
        {
            _category = category;
            _directory = directory;
            _minLevel = minLevel;
            _writeLock = writeLock;
        }

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => logLevel >= _minLevel && logLevel != LogLevel.None;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter
        )
        {
            if (!IsEnabled(logLevel))
                return;

            var message = formatter(state, exception);
            if (string.IsNullOrEmpty(message) && exception == null)
                return;

            var line = new StringBuilder()
                .Append(DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff"))
                .Append(' ')
                .Append(logLevel.ToString().ToLowerInvariant())
                .Append(": ")
                .Append(_category)
                .Append(": ")
                .Append(message);

            if (exception != null)
                line.AppendLine().Append(exception);

            var filePath = Path.Combine(_directory, $"api-{DateTime.Now:yyyy-MM-dd}.log");

            lock (_writeLock)
            {
                File.AppendAllText(filePath, line.AppendLine().ToString(), Encoding.UTF8);
            }
        }
    }
}
