# Пользовательский путь: Energo-Mir TimeSeries Spikes Analyzer

Приложение — **SPA без URL-маршрутов**. Экраны переключаются состоянием в `AppShell`. Все запросы к API идут с заголовком **`X-Session-Token`** (токен из `localStorage.dbToken`).

---

## Обзорная карта (Mermaid)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {
  'primaryColor': '#d0e4f7',
  'primaryTextColor': '#0a1a3b',
  'primaryBorderColor': '#2a5a9b',
  'lineColor': '#3a7ac8',
  'secondaryColor': '#e8f0fe',
  'tertiaryColor': '#f5f9ff',
  'clusterBkg': '#f5f9ff',
  'clusterBorder': '#3a7ac8',
  'nodeBorder': '#2a5a9b',
  'nodeTextColor': '#0a1a3b',
  'fontFamily': 'Arial, sans-serif',
  'edgeLabelBackground': '#ffffff',
  'edgeLabelColor': '#0a1a3b'
}}}%%
flowchart TB
    subgraph entry["ВХОД В СИСТЕМУ"]
        START([Открытие приложения]) --> HAS_TOKEN{Есть dbToken?}
        HAS_TOKEN -->|Нет| LOGIN[Экран Подключение к БД]
        HAS_TOKEN -->|Да| SHELL[Главный экран]
        LOGIN -->|Успех| SHELL
    end

    subgraph shell["ГЛАВНЫЙ ЭКРАН (AppShell)"]
        SHELL --> RAIL[Левая панель]
        SHELL --> CONTENT{Выбор источника}

        CONTENT -->|Схема dbo| DBO[Телеметрия DBO]
        CONTENT -->|Схема em_protocol| EM[Телеметрия EM Protocol]
        CONTENT -->|Колонка с датой| GEN[Generic-анализатор]
        CONTENT -->|Нет выбора| EMPTY[Пустое состояние]

        RAIL --> DB_DRAWER[Источники данных]
        RAIL --> HIST_DRAWER[История анализов]
        RAIL --> QUEUE_PAGE[Очередь анализа]
        RAIL --> NET_DRAWER[Сетевые запросы]
        RAIL --> HANGFIRE[Hangfire]
        RAIL --> THEME[Тема]
        RAIL --> LOGOUT[Выход]
    end

    subgraph analysis["ЭКРАН АНАЛИЗА"]
        DBO --> CONTROLS[Панель управления]
        EM --> CONTROLS
        GEN --> CONTROLS

        CONTROLS --> PERIOD[Выбор периода]
        CONTROLS --> FILTERS[Фильтры]
        CONTROLS --> PREVIEW[Превью таблицы]
        CONTROLS --> RUN[Запустить анализ]

        RUN --> JOB[Постановка в очередь]
        JOB --> PROGRESS[Прогресс выполнения]
        PROGRESS --> PARTIAL[Частичные результаты]
        PROGRESS --> RESULT[Полный результат]

        RESULT --> KPI[KPI-карточки]
        RESULT --> CHART[График аномалий]
        RESULT --> DONUT[Критичность]
        RESULT --> LIST[Список аномалий]

        CHART --> POINT[Клик по точке]
        POINT --> DETAILS[Детализация точки]

        RESULT --> EXPORT[Экспорт в Excel]
    end

    subgraph queue["ОЧЕРЕДЬ АНАЛИЗА"]
        QUEUE_PAGE --> ACTIVE[Активные задачи]
        QUEUE_PAGE --> RECENT[Недавно завершённые]

        ACTIVE --> CANCEL[Отменить]
        ACTIVE --> WATCH[Смотреть partial]
        RECENT --> OPEN[Открыть результат]
        RECENT --> RESUME[Продолжить — Failed / Cancelled]
    end

    subgraph history["ИСТОРИЯ"]
        HIST_DRAWER --> LIST_JOBS[Список задач]
        LIST_JOBS --> LOAD[Загрузить результат]
        LIST_JOBS --> DELETE[Удалить]
    end
```

> Очередь — полноэкранная страница (`mainView = queue`), не drawer. Resume доступен при `canResume` (Failed / Cancelled / Pending с checkpoint).

---

## 1. Общая карта (техническая)

```mermaid
flowchart TB
    subgraph entry [Вход]
        START([Открытие приложения]) --> HAS_TOKEN{Есть dbToken?}
        HAS_TOKEN -->|Нет| LOGIN[Экран «Подключение к БД»]
        HAS_TOKEN -->|Да| SHELL[AppShell — рабочая область]
        LOGIN -->|POST /auth/connect| SHELL
    end

    subgraph shell [AppShell]
        SHELL --> RAIL[Левая панель rail]
        SHELL --> CONTENT{mainView}

        CONTENT -->|analysis| ANALYSIS[Экран анализа]
        CONTENT -->|queue| QUEUE[Очередь анализа]

        ANALYSIS --> EMPTY[Пустое состояние]
        ANALYSIS --> DBO[Телеметрия DBO]
        ANALYSIS --> EM[Телеметрия EM Protocol]
        ANALYSIS --> GEN[Generic-анализатор]

        RAIL --> DRAWER_DB[Drawer: Источники данных]
        RAIL --> DRAWER_HIST[Drawer: История анализов]
        RAIL --> DRAWER_NET[Drawer: Сетевые запросы]
        RAIL --> HANGFIRE[Hangfire — новая вкладка]
    end

    subgraph session [Сессия]
        TOKEN[X-Session-Token]
        FP[Connection Fingerprint на job]
        TOKEN -.->|все API| API[(Backend API)]
        FP -.->|resume / обработка| API
    end
```

---

## 2. Подключение к базе данных

1. Нет `dbToken` → экран **«Подключение к БД»**.
2. Хост, порт, user, password, СУБД → `POST /api/auth/connect`.
3. Токен в `localStorage.dbToken` → `AppShell`.
4. После рестарта API токен недействителен → 401 → снова экран входа.

```mermaid
sequenceDiagram
    actor U as Пользователь
    participant UI as Frontend
    participant LS as localStorage
    participant API as Backend /auth/connect

    U->>UI: Открывает приложение
    UI->>LS: Читает dbToken
    alt Токена нет
        UI->>U: Экран «Подключение к БД»
        U->>UI: «Подключиться»
        UI->>API: POST connect
        API-->>UI: session token
        UI->>LS: dbToken = token
        UI->>U: AppShell
    else Токен есть
        UI->>U: AppShell сразу
    end
```

---

## 3. Выбор источника данных

| Выбор в дереве | Экран |
|----------------|-------|
| Схема `dbo` | Телеметрия DBO |
| Схема `em_protocol` | Телеметрия EM Protocol |
| Колонка дата/время | Generic-анализатор |
| Колонка не дата/время | Toast с ошибкой |

```mermaid
flowchart LR
    DB[База данных] --> SCHEMA[Схема]
    SCHEMA -->|dbo| DBO[Телеметрия DBO]
    SCHEMA -->|em_protocol| EM[Телеметрия EM Protocol]
    SCHEMA --> TABLE[Таблица]
    TABLE --> COL[Колонка]
    COL -->|дата/время| GEN[Generic]
    COL -->|другой тип| ERR[Toast]
```

---

## 4. Запуск анализа

1. Период, фильтры, (опционально) превью.
2. **Запустить анализ** → enqueue (`/dbo|em-protocol|GenericAnalysis/enqueue`).
3. Polling: status 3 с, partial 8 с (пока вкладка видима).
4. Partial → график по батчам; Completed → KPI, donut, список, Excel.

```mermaid
sequenceDiagram
    actor U as Пользователь
    participant D as Дашборд
    participant API as Backend
    participant HF as Hangfire

    U->>D: Запустить анализ
    D->>API: POST enqueue
    API->>HF: ProcessJob
    API-->>D: jobId
    loop Polling
        D->>API: status / partial-result
        API-->>D: progress, series
    end
    HF->>API: DetectSpikes + save
    API-->>D: Completed
```

---

## 5. Очередь анализа

| Действие | Условие |
|----------|---------|
| Смотреть | Running + partial |
| Открыть | Completed + result / Cancelled + partial |
| Стоп / Отмена | Pending / Running |
| Продолжить | `canResume === true` |

```mermaid
flowchart TB
    QUEUE[Очередь] --> ACTIVE[Активные]
    QUEUE --> RECENT[Недавно завершённые]
    ACTIVE --> WATCH[Смотреть]
    ACTIVE --> STOP[Отмена]
    RECENT --> OPEN[Открыть]
    RECENT --> RESUME[Продолжить]
    RESUME --> API[POST /analysis-jobs/id/resume]
```

---

## 6. Resume и Seed

**canResume:** Failed / Pending / Cancelled + `ProcessedUntil` + (partial **или** `CompletedBatchCount > 0`).

| | Назначение |
|---|------------|
| `ProcessedUntil` | Курсор: с какой даты продолжать батчи |
| `SeedSeries` | Ряд из `{id}.partial.jsonl` до курсора |

Fingerprint текущего подключения должен совпасть с job.

```mermaid
flowchart TB
    BTN[Продолжить] --> CHECK{canResume?}
    CHECK -->|Да| FP{fingerprint OK?}
    FP -->|Да| PEND[Pending → Hangfire]
    PEND --> LOAD[Seed из partial]
    LOAD --> RUN[Батчи с ProcessedUntil]
    RUN --> DONE[Completed]
```

---

## 7. Сводная таблица путей

| # | Путь | Старт → Финиш |
|---|------|---------------|
| A | Вход | Подключение → AppShell |
| B | DBO / EM / Generic | Источник → анализ → результат |
| C | Отмена | Остановить → Cancelled + checkpoint |
| D | Resume | Продолжить → Completed |
| E | Очередь | Обзор / открыть / отмена / resume |
| F | Excel | Завершённый job → .xlsx |
| G | Logout / 401 | Снова подключение |

---

## Связанная документация

- [Архитектура frontend](./architecture.md)
- [API-клиент](./api-client.md)
- [Фичи и экраны](./features.md)
- [Backend API reference](../../backend/docs/api-reference.md)
