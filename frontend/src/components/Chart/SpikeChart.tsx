import React, { useMemo, useRef, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { Switch } from 'antd';
import type { SpikePoint } from '../../types/analytics.types';
import dayjs from 'dayjs';

interface Props {
  data: SpikePoint[];
  showMarkers?: boolean;
  showCriticalMarkers?: boolean;
  showWarningMarkers?: boolean;
  hideToolbar?: boolean;
  onShowMarkersChange?: (value: boolean) => void;
  onPointClick?: (point: SpikePoint) => void;
}

export const SpikeChart: React.FC<Props> = ({
  data,
  showMarkers = true,
  showCriticalMarkers = true,
  showWarningMarkers = true,
  hideToolbar = false,
  onShowMarkersChange,
  onPointClick,
}) => {
  const chartRef = useRef<ReactECharts>(null);

  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [data]);

  useEffect(() => {
    if (!chartRef.current || !onPointClick) return;
    const echartsInstance = chartRef.current.getEchartsInstance();
    const zr = echartsInstance.getZr();

    const handleClick = (params: { offsetX: number; offsetY: number }) => {
      const pointInPixel = [params.offsetX, params.offsetY];
      if (echartsInstance.containPixel('grid', pointInPixel)) {
        const pointInGrid = echartsInstance.convertFromPixel({ seriesIndex: 0 }, pointInPixel);
        if (pointInGrid && pointInGrid.length > 0) {
          const xIndex = Math.round(pointInGrid[0] as number);
          if (xIndex >= 0 && xIndex < sortedData.length) {
            const dataPoint = sortedData[xIndex];
            if (dataPoint) onPointClick(dataPoint);
          }
        }
      }
    };

    zr.on('click', handleClick);
    return () => {
      zr.off('click', handleClick);
    };
  }, [sortedData, onPointClick]);

  const option = useMemo(() => {
    const timestamps = sortedData.map(d => d.timestamp);
    const values = sortedData.map(d => d.value);

    const spikeMarkers = showMarkers
      ? sortedData
          .filter(d => d.isSpike)
          .filter(d => (d.pValue < 0.01 ? showCriticalMarkers : showWarningMarkers))
          .map(d => ({
            coord: [d.timestamp, d.value] as [string, number],
            symbol: 'circle',
            symbolSize: d.pValue < 0.01 ? 10 : 8,
            itemStyle: {
              color: d.pValue < 0.01 ? '#D94A4A' : '#E8A838',
              shadowBlur: 12,
              shadowColor: d.pValue < 0.01 ? 'rgba(219, 74, 74, 0.6)' : 'rgba(232, 168, 56, 0.6)',
            },
          }))
      : [];

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#1A2332',
        textStyle: { color: '#ffffff', fontSize: 12 },
        formatter: (params: { axisValue: string }[]) => {
          const point = params[0];
          const dataPoint = sortedData.find(d => d.timestamp === point.axisValue);
          if (!dataPoint) return '';

          let html = `<b>${dayjs(dataPoint.timestamp).format('DD.MM.YYYY HH:mm')}</b><br/>`;
          html += `Сообщений: <b>${dataPoint.value}</b><br/>`;
          html += `P-Value: ${dataPoint.pValue.toFixed(4)}<br/>`;
          html += `Доверие: ${dataPoint.confidencePercent.toFixed(1)}%<br/>`;

          if (dataPoint.isSpike) {
            const severityText =
              dataPoint.pValue < 0.01 ? 'Критическая аномалия' : 'Предупреждение';
            html += `<span style="color:#D94A4A;font-weight:700;">${severityText}</span>`;
          }

          return html;
        },
      },
      grid: {
        left: 60,
        right: 30,
        bottom: 80,
        top: onShowMarkersChange ? 40 : 30,
      },
      xAxis: {
        type: 'category',
        data: timestamps,
        axisLine: { lineStyle: { color: '#E9EEFA' } },
        axisLabel: {
          color: '#7A8B9E',
          fontSize: 11,
          rotate: 30,
          formatter: (value: string) => dayjs(value).format('DD.MM HH:mm'),
        },
        splitLine: { show: false },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        name: 'Количество сообщений телеметрии',
        nameLocation: 'middle',
        nameRotate: 90,
        nameGap: 50,
        nameTextStyle: { color: '#7A8B9E', fontSize: 12 },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: '#EFF2F9', type: 'dashed' } },
        axisLabel: { color: '#7A8B9E', fontSize: 11 },
      },
      series: [
        {
          name: 'Показатели',
          type: 'line',
          data: values,
          smooth: false,
          showSymbol: false,
          lineStyle: {
            color: '#4761BF',
            width: 2.5,
            shadowBlur: 32,
            shadowColor: 'rgba(71, 97, 191, 0.95)',
            shadowOffsetY: 6,
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(71, 97, 191, 0.25)' },
                { offset: 1, color: 'rgba(71, 97, 191, 0.0)' },
              ],
            },
          },
          markPoint: spikeMarkers.length > 0 ? { data: spikeMarkers, symbolKeepAspect: true } : undefined,
          markLine: {
            silent: true,
            symbol: 'none',
            data: [
              {
                type: 'average',
                name: 'Средняя',
                label: { formatter: 'Ср.: {c}', color: '#7A8B9E', position: 'insideEndTop', fontSize: 10 },
                lineStyle: { color: '#7A8B9E', type: 'dashed' },
              },
              {
                type: 'min',
                name: 'Минимум',
                label: { formatter: 'Мин.: {c}', color: '#5A9E7A', position: 'insideStartTop', fontSize: 10 },
                lineStyle: { color: '#5A9E7A', type: 'dashed' },
              },
              {
                type: 'max',
                name: 'Максимум',
                label: { formatter: 'Макс.: {c}', color: '#C97A6E', position: 'insideEndBottom', fontSize: 10 },
                lineStyle: { color: '#C97A6E', type: 'dashed' },
              },
            ],
          },
        },
      ],
      dataZoom: [
        {
          type: 'slider',
          start: 0,
          end: 100,
          height: 28,
          bottom: 8,
          borderColor: '#dce2ea',
          backgroundColor: '#f5f7fa',
          fillerColor: 'rgba(71, 97, 191, 0.15)',
          handleStyle: { color: '#4761BF' },
          textStyle: { color: '#7A8B9E', fontSize: 10 },
        },
      ],
      color: ['#4761BF'],
    };
  }, [sortedData, showMarkers, showCriticalMarkers, showWarningMarkers, onShowMarkersChange]);

  const onEvents = {
    click: (params: {
      componentType?: string;
      seriesType?: string;
      name?: string;
      dataIndex?: number;
      data?: { coord: [string | number, number] };
    }) => {
      if (!onPointClick) return;

      let timestamp: string | undefined;
      if (params.componentType === 'series' && params.seriesType === 'line') {
        if (params.name) {
          timestamp = params.name;
        } else if (params.dataIndex !== undefined) {
          timestamp = sortedData[params.dataIndex]?.timestamp;
        }
      } else if (params.componentType === 'markPoint' && params.data?.coord) {
        const coordX = params.data.coord[0];
        if (typeof coordX === 'string') {
          timestamp = coordX;
        } else if (typeof coordX === 'number') {
          timestamp = sortedData[coordX]?.timestamp;
        }
      }

      if (timestamp) {
        const point = sortedData.find(d => d.timestamp === timestamp);
        if (point) onPointClick(point);
      }
    },
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {onShowMarkersChange && !hideToolbar && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 8,
            marginBottom: 8,
            fontSize: 12,
            color: '#7A8B9E',
            fontWeight: 600,
          }}
        >
          <span>Маркеры пиков</span>
          <Switch
            size="small"
            checked={showMarkers}
            onChange={onShowMarkersChange}
            style={{ background: showMarkers ? '#4761BF' : undefined }}
          />
        </div>
      )}

      <ReactECharts
        ref={chartRef}
        option={option}
        style={{ height: 480, width: '100%' }}
        opts={{ renderer: 'canvas' }}
        lazyUpdate
        onEvents={onEvents}
      />
    </div>
  );
};
