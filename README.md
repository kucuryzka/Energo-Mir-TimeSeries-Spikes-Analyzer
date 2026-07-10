# Energo-Mir-TimeSeries-Spikes-Analyzer

Веб-приложение для анализа временных рядов и детекции аномалий (spikes) в данных энергетических систем.

## Структура

```
├── backend/     ASP.NET Core 8 API + ML.NET spike detection
├── frontend/    React 19 SPA (Vite + Ant Design)
└── README.md
```

## Быстрый старт

```bash
# Backend
dotnet run --project backend/API/API.csproj

# Frontend (отдельный терминал)
cd frontend && npm install && npm run dev
```

- API: `http://localhost:5090`
- UI: `http://127.0.0.1:5173`

## Документация

| Раздел | Путь |
|--------|------|
| **Backend & API** | [backend/docs/README.md](backend/docs/README.md) |
| API Reference (эндпоинты, DTO) | [backend/docs/api-reference.md](backend/docs/api-reference.md) |
| **Frontend** | [frontend/docs/README.md](frontend/docs/README.md) |
