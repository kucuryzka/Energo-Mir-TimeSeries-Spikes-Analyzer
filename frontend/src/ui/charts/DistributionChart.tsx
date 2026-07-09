import React, { useMemo, useState } from 'react';
import { Table } from 'antd';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import type { DistributionItemDto } from '../../types/analytics.types';

interface Props {
  data: DistributionItemDto[];
  title: string;
}

interface ChartDataItem {
  name: string;
  value: number;
}

const COLORS = [
  '#3B65D9', '#5B81EA', '#7B9DF5', '#A0B9F9', '#C5D4FC',
  '#00C49F', '#52D9B5', '#8AE5CB', '#B8F0DF', '#D9F5EB',
  '#FFBB28', '#FFD166', '#FFE08C', '#FFEBB5', '#FFF5D8',
  '#FF8042', '#FF9E6D', '#FFBA99', '#FFD4C4', '#FFECE3',
];

const OTHER_COLOR = '#FFBB28'; // Жёлтый для "Других"

const RADIAN = Math.PI / 180;

// Кастомная метка с выносками
const renderCustomizedLabel = (props: any) => {
  const { cx, cy, midAngle, outerRadius, percent, name, index } = props;
  
  const radius = outerRadius + 18;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  
  const lineRadius = outerRadius + 2;
  const lineX = cx + lineRadius * Math.cos(-midAngle * RADIAN);
  const lineY = cy + lineRadius * Math.sin(-midAngle * RADIAN);

  const displayName = name.length > 25 ? name.substring(0, 23) + '…' : name;
  const percentValue = (percent * 100).toFixed(1);

  // Показываем только для топ-3 или если процент > 5%
  const isTop3 = index < 3;
  const isSignificant = parseFloat(percentValue) > 5;

  if (!isTop3 && !isSignificant) return null;

  const isLeft = x < cx;
  const lineEndX = isLeft ? x - 8 : x + 8;

  const fontSize = 11;
  const fontWeight = 600;

  // Для "Других" используем жёлтый цвет
  const isOther = name === 'Другие';
  const color = isOther ? OTHER_COLOR : COLORS[index % COLORS.length];

  return (
    <g>
      <line
        x1={lineX}
        y1={lineY}
        x2={lineEndX}
        y2={y}
        stroke={color}
        strokeWidth={1.5}
        strokeDasharray={isTop3 ? 'none' : '3,3'}
        opacity={0.6}
      />
      <circle
        cx={lineX}
        cy={lineY}
        r={3}
        fill={color}
        opacity={0.8}
      />
      <text
        x={isLeft ? x - 10 : x + 10}
        y={y}
        fill="var(--text-heading)"
        textAnchor={isLeft ? 'end' : 'start'}
        dominantBaseline="central"
        fontSize={fontSize}
        fontWeight={fontWeight}
        style={{
          textShadow: '0 1px 4px var(--pie-label-shadow)',
          pointerEvents: 'none',
          letterSpacing: '0.3px',
        }}
      >
        {`${displayName} ${percentValue}%`}
      </text>
    </g>
  );
};

export const DistributionChart: React.FC<Props> = ({ data, title }) => {
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);

  const total = useMemo(() => data.reduce((acc, curr) => acc + curr.count, 0), [data]);

  // Определяем топ-10 категорий (которые попадут на график)
  const top10Categories = useMemo(() => {
    return [...data]
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(item => item.category);
  }, [data]);

  // Функция получения цвета для категории
  const getColorForCategory = (category: string): string => {
    // Если категория "Другие" — жёлтый
    if (category === 'Другие') return OTHER_COLOR;
    // Если категория в топ-10 — даём ей цвет по индексу
    const index = top10Categories.indexOf(category);
    if (index !== -1) {
      return COLORS[index % COLORS.length];
    }
    // Если не в топ-10 — жёлтый (как "Другие")
    return OTHER_COLOR;
  };

  const chartData: ChartDataItem[] = useMemo(() => {
    const sorted = [...data]
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(item => ({
        name: item.category || 'Неизвестно',
        value: item.count
      }));

    if (data.length > 10) {
      const otherCount = data.slice(10).reduce((acc, curr) => acc + curr.count, 0);
      sorted.push({ name: 'Другие', value: otherCount });
    }

    return sorted;
  }, [data]);

  const columns = useMemo(() => [
    {
      title: 'Категория',
      dataIndex: 'category',
      key: 'category',
      render: (text: string) => {
        const color = getColorForCategory(text);
        return (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontWeight: 500,
            color: 'var(--text-heading)',
          }}>
            <div style={{
              width: 12,
              height: 12,
              borderRadius: 4,
              background: color,
              flexShrink: 0,
            }} />
            <span>{text || 'Неизвестно'}</span>
          </div>
        );
      },
    },
    {
      title: 'Количество',
      dataIndex: 'count',
      key: 'count',
      align: 'right' as const,
      render: (val: number) => (
        <span style={{
          fontWeight: 500,
          color: 'var(--text-heading)',
          fontFeatureSettings: '"tnum"',
        }}>
          {val.toLocaleString('ru-RU')}
        </span>
      ),
      sorter: (a: DistributionItemDto, b: DistributionItemDto) => a.count - b.count,
      defaultSortOrder: 'descend' as const,
    },
    {
      title: 'Доля',
      key: 'percent',
      align: 'right' as const,
      render: (_: any, record: DistributionItemDto) => {
        const percent = total > 0 ? (record.count / total) * 100 : 0;
        const color = getColorForCategory(record.category);
        return (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 8,
          }}>
            <div style={{
              width: 60,
              height: 4,
              background: '#E9EEFA',
              borderRadius: 2,
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${Math.min(percent, 100)}%`,
                height: '100%',
                background: color,
                borderRadius: 2,
                transition: 'width 0.6s ease',
              }} />
            </div>
            <span style={{
              fontWeight: 500,
              color: 'var(--text-secondary)',
              minWidth: 55,
              textAlign: 'right',
              fontFeatureSettings: '"tnum"',
            }}>
              {percent.toFixed(2)}%
            </span>
          </div>
        );
      }
    }
  ], [total, data, top10Categories]);

  const onPieEnter = (_: any, index: number) => setActiveIndex(index);
  const onPieLeave = () => setActiveIndex(undefined);

  return (
    <div className="dashboard-block distribution-chart" style={{ marginBottom: 24 }}>
      {title && (
        <div style={{
          fontSize: 16,
          fontWeight: 700,
          color: 'var(--text-heading)',
          marginBottom: 20,
          letterSpacing: '0.3px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          {title}
          <span style={{
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--text-muted)',
            background: 'var(--tab-pill-bg)',
            padding: '2px 10px',
            borderRadius: 999,
          }}>
            {data.length} категорий
          </span>
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'center' }}>
        <div style={{ flex: '1 1 350px', minWidth: 320, height: 520, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={100}
                paddingAngle={3}
                dataKey="value"
                nameKey="name"
                label={renderCustomizedLabel}
                labelLine={false}
                onMouseEnter={onPieEnter}
                onMouseLeave={onPieLeave}
                animationDuration={800}
                animationEasing="ease-in-out"
                isAnimationActive={true}
              >
                {chartData.map((entry: ChartDataItem, index: number) => {
                  // Для "Других" — жёлтый цвет
                  const isOther = entry.name === 'Другие';
                  const color = isOther ? OTHER_COLOR : COLORS[index % COLORS.length];
                  return (
                    <Cell
                      key={`cell-${index}`}
                      fill={color}
                      style={{
                        cursor: 'pointer',
                        filter: index === activeIndex 
                          ? 'drop-shadow(0 4px 24px rgba(59, 101, 217, 0.5))' 
                          : 'drop-shadow(0 2px 8px rgba(59, 101, 217, 0.12))',
                        transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                        transform: index === activeIndex ? 'scale(1.08)' : 'scale(1)',
                        transformOrigin: 'center',
                      }}
                    />
                  );
                })}
              </Pie>
              <Tooltip
                formatter={(value: any, name: any) => {
                  const numValue = typeof value === 'number' ? value : 0;
                  const percent = total > 0 ? (numValue / total) * 100 : 0;
                  return [`${numValue.toLocaleString('ru-RU')} (${percent.toFixed(2)}%)`, name];
                }}
                contentStyle={{
                  borderRadius: 14,
                  backgroundColor: 'var(--tooltip-bg, #ffffff)',
                  border: '1px solid var(--border-subtle, #e2e8f0)',
                  boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
                  padding: '14px 18px',
                }}
                itemStyle={{
                  color: 'var(--text-heading, #1A2332)',
                  fontWeight: 600,
                  fontSize: 13,
                }}
                labelStyle={{
                  fontWeight: 700,
                  color: 'var(--text-heading, #1A2332)',
                  marginBottom: 6,
                  fontSize: 14,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div style={{ flex: '1 1 350px', minWidth: 320 }}>
          <Table
            dataSource={data}
            columns={columns}
            rowKey="category"
            size="middle"
            pagination={{ 
              pageSize: 8, 
              showSizeChanger: false,
              hideOnSinglePage: true,
            }}
            style={{
              borderRadius: 16,
              overflow: 'hidden',
              background: 'var(--table-surface-bg)',
              border: '1px solid var(--border-subtle)',
              boxShadow: '0 8px 24px rgba(0,0,0,.15)',
            }}
            components={{
              header: {
                cell: (props: any) => (
                  <th {...props} style={{
                    ...props.style,
                    background: 'var(--tab-pill-bg)',
                    color: 'var(--text-secondary)',
                    fontWeight: 600,
                    fontSize: 12,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    padding: '12px 16px',
                  }} />
                ),
              },
            }}
          />
        </div>
      </div>
    </div>
  );
};