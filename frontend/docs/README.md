# Frontend documentation

SPA для анализа временных рядов и детекции аномалий (spikes). Стек: **React 19**, **TypeScript**, **Vite 8**, **Ant Design 6**, **Axios**, **Recharts**.

## Быстрый старт

```bash
cd frontend
npm install
npm run dev
```

- UI: `http://127.0.0.1:5173`
- API proxy: `/api/dist/api` → `http://localhost:5090/api`
- Hangfire proxy: `/api/dist/hangfire` → `http://localhost:5090`

Перед запуском фронта должен работать backend (`dotnet run --project backend/API/API.csproj`).

## Структура `src/`

```
src/
├── App.tsx                 # Auth gate, theme, providers
├── main.tsx                # Entry point
├── api/                    # HTTP-клиент и модули API
├── context/                # React context (shell rail)
├── features/               # Экраны и бизнес-фичи
│   ├── connection/         # Форма подключения к БД
│   ├── explorer/           # Дерево БД
│   ├── telemetry/          # DBO / EM анализ
│   ├── generic-analyzer/   # Произвольные таблицы
│   ├── queue/              # Очередь задач
│   └── query-tracker/      # Монитор HTTP-запросов
├── hooks/                  # Переиспользуемые хуки
├── layout/                 # AppShell (основной layout)
├── store/                  # Модульные сторы (не Redux)
├── types/                  # TypeScript типы API
├── ui/                     # UI-компоненты, графики, KPI
└── utils/                  # Утилиты (polling, spikes, dates)
```

## Навигация по документации

| Документ | Содержание |
|----------|------------|
| [architecture.md](architecture.md) | Маршрутизация, провайдеры, потоки данных |
| [api-client.md](api-client.md) | Axios, все API-модули и эндпоинты |
| [features.md](features.md) | Экраны: connection, explorer, telemetry, generic, queue |
| [ui-components.md](ui-components.md) | Графики, KPI, контролы, аномалии |
| [state-hooks-utils.md](state-hooks-utils.md) | Сторы, хуки, утилиты |
| [types.md](types.md) | TypeScript-контракты |

## Связь с backend

| Документ backend | Описание |
|------------------|----------|
| [backend/docs/api-reference.md](../../backend/docs/api-reference.md) | Полный справочник HTTP API |
| [backend/docs/README.md](../../backend/docs/README.md) | Обзор backend |

## Переменные окружения

| Переменная | По умолчанию | Назначение |
|------------|--------------|------------|
| `VITE_API_BASE_PATH` | `/api/dist/api` | Base URL для Axios |
| `VITE_HANGFIRE_PATH` | `/api/dist/hangfire/` | Ссылка на Hangfire dashboard |

Файл `.env` в репозитории отсутствует — дефолты работают с Vite proxy.

## Скрипты

| Команда | Действие |
|---------|----------|
| `npm run dev` | Dev-сервер Vite |
| `npm run build` | `tsc -b && vite build` |
| `npm run preview` | Preview production build |
| `npm run lint` | `oxlint` |

## Ключевые зависимости

| Пакет | Использование |
|-------|---------------|
| `antd` | UI-компоненты, формы, drawer, table |
| `axios` | HTTP-клиент |
| `dayjs` | Даты (UTC) |
| `recharts` | Pie chart распределения (`DistributionChart`) |
| `echarts` / `echarts-for-react` | В `package.json`, **не импортируются** — spike chart на custom SVG |

## Локальное хранилище

| Ключ | Значение |
|------|----------|
| `dbToken` | Session token (`X-Session-Token`) |
| `uiTheme` | `'light'` \| `'dark'` |

## Основной пользовательский сценарий

1. **Подключение** — `ConnectionSetup` → `POST /auth/connect` → `dbToken`
2. **Выбор БД** — drawer `DatabaseTreeSidebar`
3. **Анализ** — `TelemetryContent` (dbo/em) или `GenericAnalyzer`
4. **Постановка задачи** — enqueue → polling → график + KPI
5. **Очередь** — `AnalysisJobQueuePage` — отмена, открытие завершённых job
6. **Экспорт** — `GET /analysis-jobs/{id}/export` → скачивание Excel
