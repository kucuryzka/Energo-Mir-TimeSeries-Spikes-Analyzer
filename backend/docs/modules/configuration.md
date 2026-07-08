# Configuration

Настройки приложения. Папка: `API/Configuration/`, файл `appsettings.json`.

## AnalysisSettings

Секция: `"Analysis"`. Класс: `AnalysisSettings.cs`.

| Свойство | Default | Описание |
|----------|---------|----------|
| `CommandTimeoutSeconds` | 86400 | SQL command timeout (pipeline) |
| `ConnectionTimeoutSeconds` | 15 | Подключение к customer DB |
| `BatchIntervalDays` | 7 | Размер батча по времени |
| `HangfireWorkerCount` | 1 | Параллельные workers |
| `HangfireJobInvisibilityTimeoutHours` | 24 | Hangfire SQLite timeout |
| `ResultsDirectory` | results | JSONL results (относительно ContentRoot) |
| `MaxAnalysisRangeDays` | 3650 | Лимит периода анализа |
| `MaxSeriesPoints` | 500000 | Лимит точек в серии |
| `ProgressSaveIntervalSeconds` | 5 | Интервал сохранения partial |
| `PreviewCommandTimeoutSeconds` | 120 | Timeout preview запросов |

Регистрация: `builder.Services.Configure<AnalysisSettings>(...)`.

## HangfireSettings

Секция: `"Hangfire"`.

| Свойство | Описание |
|----------|----------|
| `DashboardPrefixPath` | Префикс URL dashboard (`/api/dist`) |

## LoggingSettings

Секция: `"Logging:File"` (класс в `AnalysisSettings.cs` рядом с другими settings).

| Свойство | Описание |
|----------|----------|
| `Enabled` | Включить FileLoggerProvider |
| `Directory` | Каталог логов |
| `MinLevel` | Минимальный уровень |

## ConnectionStrings

```json
{
  "DefaultConnection": "",
  "InternalConnection": "Data Source=app.db;Cache=Shared;Default Timeout=30"
}
```

| Имя | Использование |
|-----|---------------|
| `DefaultConnection` | `AddDbContext<AppDbContext>` — **не используется** в runtime path |
| `InternalConnection` | SQLite: InternalDb + Hangfire |

## Program.cs binding pattern

```csharp
builder.Services.Configure<AnalysisSettings>(...);
var analysisSettings = builder.Configuration
    .GetSection(AnalysisSettings.SectionName)
    .Get<AnalysisSettings>() ?? new();
```

Snapshot settings читаются при старте для Hangfire/SQL timeout; runtime — через `IOptions<AnalysisSettings>`.

## Environment

- `ASPNETCORE_ENVIRONMENT=Development` — Swagger enabled
- Production: `UseHttpsRedirection`

## CORS

Policy `ReactCorsPolicy`: localhost:5173, 3000, localhost.

## Forwarded headers

Для работы за nginx с префиксом `/api/dist`.
