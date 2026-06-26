import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { SpikePoint } from '../../types/analytics.types';
import dayjs from 'dayjs';

interface Props {
  data: SpikePoint[];
}

export const SpikeChart: React.FC<Props> = ({ data }) => {
  const option = useMemo(() => {
    const timestamps = data.map(d => d.timestamp);
    const values = data.map(d => d.value);

    const spikeMarkers = data
      .filter(d => d.isSpike)
      .map(d => ({
        name: 'Аварийное событие',
        coord: [d.timestamp, d.value],
        value: d.value,
        symbol: 'pin',
        symbolSize: d.pValue < 0.01 ? 60 : 45,
        itemStyle: {
          color: d.pValue < 0.01 ? '#d94a4a' : '#e8a838',
        },
        label: {
          show: true,
          formatter: `${d.value}`,
          position: 'top',
          color: '#d94a4a',
          fontWeight: 'bold',
          fontSize: 12,
        },
      }));

    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderColor: '#e8edf3',
        borderWidth: 1,
        borderRadius: 8,
        padding: [12, 16],
        textStyle: { color: '#1a2332', fontSize: 13 },
        formatter: (params: any) => {
          const point = params[0];
          const dataPoint = data.find(d => d.timestamp === point.axisValue);
          if (!dataPoint) return '';

          let html = `<b>${dayjs(dataPoint.timestamp).format('DD.MM.YYYY HH:mm')}</b><br/>`;
          html += `Сообщений: <b>${dataPoint.value}</b><br/>`;
          html += `P-Value: ${dataPoint.pValue.toFixed(4)}<br/>`;
          html += `Доверие: ${dataPoint.confidencePercent.toFixed(1)}%<br/>`;

          if (dataPoint.isSpike) {
            const severityText =
              dataPoint.pValue < 0.01 ? '🔴 КРИТИЧЕСКАЯ АВАРИЯ' :
              dataPoint.pValue < 0.05 ? '🟠 ВЫСОКАЯ ВЕРОЯТНОСТЬ АВАРИИ' :
              '🟡 ПОДОЗРИТЕЛЬНОЕ СОБЫТИЕ';
            html += `<span style="color:#d94a4a;font-weight:700;">${severityText}</span>`;
          } else {
            html += `<span style="color:#22a67e;"> Штатный режим</span>`;
          }

          return html;
        },
      },
      xAxis: {
        type: 'category',
        data: timestamps,
        axisLine: { lineStyle: { color: '#dce2ea' } },
        axisLabel: {
          color: '#6b7a8f',
          fontSize: 11,
          rotate: 30,
          formatter: (value: string) => dayjs(value).format('DD.MM HH:mm'),
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        name: 'Количество сообщений телеметрии',
        nameTextStyle: { color: '#6b7a8f', fontSize: 12 },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: '#eef2f6', type: 'dashed' } },
        axisLabel: { color: '#6b7a8f', fontSize: 11 },
      },
      series: [
        {
          name: 'Сообщения телеметрии',
          type: 'line',
          data: values,
          smooth: true,
          lineStyle: { color: '#4a90d9', width: 2.5 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(74, 144, 217, 0.25)' },
                { offset: 1, color: 'rgba(74, 144, 217, 0.02)' },
              ],
            },
          },
          markPoint: {
            data: spikeMarkers,
          },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: '#6b7a8f', type: 'dashed', width: 1.5 },
            label: {
              formatter: 'Средний уровень: {c}',
              color: '#6b7a8f',
              fontSize: 11,
              position: 'insideEndTop',
            },
            data: [
              {
                type: 'average',
                name: 'Средний уровень',
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
          fillerColor: 'rgba(74, 144, 217, 0.15)',
          handleStyle: { color: '#4a90d9' },
          textStyle: { color: '#6b7a8f', fontSize: 10 },
        },
      ],
      grid: {
        left: 60,
        right: 30,
        bottom: 80,
        top: 30,
      },
      color: ['#4a90d9'],
    };
  }, [data]);

  return (
    <ReactECharts
      option={option}
      style={{ height: 480, width: '100%' }}
      opts={{ renderer: 'canvas' }}
    />
  );
};
