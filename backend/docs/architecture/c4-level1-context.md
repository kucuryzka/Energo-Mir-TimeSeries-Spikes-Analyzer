# C4 Level 1 — System Context

## Назначение системы

**Energo-Mir TimeSeries Spikes Analyzer** — веб-приложение для анализа телеметрии энергетических объектов: агрегация временных рядов, детекция аномалий (spikes) и визуализация результатов.

## Диаграмма контекста

```mermaid
C4Context
    title System Context — TimeSeries Spikes Analyzer

    Person(analyst, "Аналитик", "Исследует аномалии в телеметрии")
    System(app, "Spikes Analyzer", "React UI + .NET API")
    System_Ext(mssql, "MS SQL Server", "dbo.METERINGS, em_protocol и др.")
    System_Ext(postgres, "PostgreSQL", "Опциональный источник данных")
    System_Ext(nginx, "Nginx / reverse proxy", "Прокси /api/dist → API")

    Rel(analyst, app, "HTTPS, браузер")
    Rel(app, mssql, "ADO.NET, Dapper, EF", "TCP")
    Rel(app, postgres, "Npgsql", "TCP")
    Rel(nginx, app, "Проксирование API и Hangfire")
```

## Акторы

| Актор | Описание |
|-------|----------|
| Аналитик | Подключается к БД, выбирает период и гранулярность, запускает анализ, смотрит график и экспортирует Excel |

## Внешние системы

| Система | Роль |
|---------|------|
| MS SQL Server / PostgreSQL | Хранилище сырых записей телеметрии (METERINGS, em_protocol.Records и произвольные таблицы) |
| Nginx | В продакшене: статика фронта, прокси `/api/dist/api` → backend `/api` |

## Границы ответственности backend

Backend **не** отвечает за:

- Рендеринг UI (React/Vite)
- Долгосрочное хранение учётных записей пользователей (сессия — токен в памяти API)
- Репликацию данных телеметрии

Backend **отвечает** за:

- Валидацию подключения к БД и сессии
- Очередь и выполнение анализа (Hangfire)
- ML-детекцию аномалий
- Хранение результатов job (SQLite + JSONL)
- Excel-экспорт
