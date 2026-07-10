# UI Components

Компоненты в `src/ui/` и `src/ui/charts/`.

## Layout & Controls

### TelemetryControls

**Путь:** `ui/TelemetryControls.tsx`

Панель управления анализом.

| Блок | Элементы |
|------|----------|
| Period | RangePicker с пресетами (7д, 30д, 90д, год) |
| Filters popover | Granularity select, channel/object search, confidence slider, window size input |
| Actions | Кнопка «Анализировать», hint длительности, export dropdown, toggle preview |
| Channel filter | Select с поиском (dbo objects / em channels) |

**Export menu:**
- `onExport(false)` — «Скачать Excel»
- `onExport(true)` — «С распределением из БД»

### AnalysisJobProgress

**Путь:** `ui/AnalysisJobProgress.tsx`

| Элемент | Условие |
|---------|---------|
| Progress bar | `progress` 0–100 |
| Cancel button | `onCancel` |
| Info alert | Partial results available while Running |

### TablePreviewCard

**Путь:** `ui/TablePreviewCard.tsx`

| Часть | Описание |
|-------|----------|
| `TablePreviewContent` | Таблица sample rows |
| Row count | `approximateRowCount` |
| Actions | «Использовать как начало/конец периода» |

---

## KPI & Anomalies

### KpiRow

**Путь:** `ui/KpiRow.tsx`

6 карточек с анимацией (`useCountUp`):

| KPI | Источник |
|-----|----------|
| Всего значений | `stats.totalCount` |
| Аномалии | `stats.spikesCount` |
| Критические | `stats.criticalCount` |
| Среднее | `stats.avgValue` |
| Максимум | `stats.maxValue` |
| Сумма точек | `stats.totalPoints` |

### AnomalyDonut

**Путь:** `ui/AnomalyDonut.tsx`

SVG donut: доля critical vs warning среди spikes.

### AnomalyList

**Путь:** `ui/AnomalyList.tsx`

Скроллируемый список аномалий:
- Severity chip (critical / warning / info)
- Timestamp, value, p-value
- Hover sync с графиком (`onHoverIndex`)

---

## Charts

### SpikeOverviewChart

**Путь:** `ui/charts/SpikeOverviewChart.tsx`

Обёртка над `SpikeChart`:
- Заголовок и легенда
- Toggles: avg line, max line, min line, spike markers
- Передаёт enriched `SpikePoint[]`

### SpikeChart

**Путь:** `ui/charts/SpikeChart.tsx`

**Custom SVG** (не ECharts). Основной график временного ряда.

| Возможность | Реализация |
|-------------|------------|
| Downsampling | LTTB, max 3000 точек |
| Zoom | `useSpikeZoom` — slider + drag handles |
| Reference lines | avg, max, min (опционально) |
| Spike markers | Красные/оранжевые точки по severity |
| Tooltip | Hover card с timestamp, value, p-value |
| Click | `onPointClick` → point detail drawer |

### spikeChartGeometry.ts

**Путь:** `ui/charts/spikeChartGeometry.ts`

Pure functions:

| Функция | Назначение |
|---------|------------|
| `downsampleLttb` | LTTB algorithm |
| `buildLinePath` | SVG path для серии |
| `computeScales` | X/Y scales для viewBox |
| `formatAxisLabels` | Подписи осей |
| Constants | `CHART_VIEWBOX`, padding, colors |

### useSpikeZoom.ts

**Путь:** `ui/charts/useSpikeZoom.ts`

| State | Описание |
|-------|----------|
| `zoomRange` | `[startIndex, endIndex]` |
| Handlers | Drag на slider track и handles |
| `visibleData` | Slice данных по zoom |

### DistributionChart

**Путь:** `ui/charts/DistributionChart.tsx`

**Recharts** `PieChart`:
- Top-10 категорий + slice «Другие»
- Таблица с share bars
- Используется для EM EventCode distribution и DBO object distribution

---

## useCountUp

**Путь:** `ui/useCountUp.ts`

Анимация чисел для KPI:
- Duration: 900ms default
- Easing: `easeOutCubic`
- Hook: `useCountUp(target, enabled?)`

---

## Стилизация графиков

### CSS classes (AppShell.css)

| Class | Назначение |
|-------|------------|
| `.chart-container` | Wrapper |
| `.chart-header` | Title + legend |
| `.spike-chart-svg` | SVG sizing |
| `.zoom-slider` | Zoom control |
| `.kpi-row`, `.kpi-card` | KPI layout |

### Severity colors

Из `spikeUtils.getSeverity`:

| Severity | pValue | Цвет (типично) |
|----------|--------|----------------|
| critical | < 0.01 | Красный |
| warning | < 0.05 | Оранжевый |
| info | < 0.10 | Жёлтый |
| normal | ≥ 0.10 | Серый / без маркера |

---

## Компонентная иерархия (analyzer screen)

```
TelemetryContent / GenericAnalyzer
├── TelemetryControls
├── AnalysisJobProgress (if loading)
├── TablePreviewCard (if open)
├── KpiRow
├── AnomalyDonut + stats
├── SpikeOverviewChart
│   └── SpikeChart
│       └── useSpikeZoom
├── DistributionChart[] (telemetry only)
├── AnomalyList (if spikes > 0)
└── Drawer: point details / history
```

---

## Зависимости UI

| Библиотека | Компоненты |
|------------|------------|
| Ant Design | Form, Button, Select, Drawer, Table, Progress, Modal, DatePicker |
| Recharts | DistributionChart only |
| Custom SVG | SpikeChart, AnomalyDonut, KpiRow animations |

`echarts` и `echarts-for-react` в dependencies, но в `src/` не импортируются. Legacy CSS `.echarts-for-react` остался в `AppShell.css`.
