import React from 'react';
import { Card, Table, Typography } from 'antd';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { DistributionItemDto } from '../../types/analytics.types';

const { Title } = Typography;

interface Props {
  data: DistributionItemDto[];
  title: string;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#8dd1e1', '#a4de6c', '#d0ed57', '#ffc658', '#f26a8d'];

export const DistributionChart: React.FC<Props> = ({ data, title }) => {
  // Вычисляем общее количество для процентов
  const total = data.reduce((acc, curr) => acc + curr.count, 0);

  // Для диаграммы берем топ 10, остальное группируем в "Другие" (если данных много)
  const chartData = [...data]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map(item => ({
      name: item.category || 'Неизвестно',
      value: item.count
    }));

  if (data.length > 10) {
    const otherCount = data.slice(10).reduce((acc, curr) => acc + curr.count, 0);
    chartData.push({ name: 'Другие', value: otherCount });
  }

  const columns = [
    {
      title: 'Категория',
      dataIndex: 'category',
      key: 'category',
      render: (text: string) => <strong>{text || 'Неизвестно'}</strong>,
    },
    {
      title: 'Количество',
      dataIndex: 'count',
      key: 'count',
      render: (val: number) => val.toLocaleString('ru-RU'),
      sorter: (a: DistributionItemDto, b: DistributionItemDto) => a.count - b.count,
      defaultSortOrder: 'descend' as const,
    },
    {
      title: 'Доля (%)',
      key: 'percent',
      render: (_: any, record: DistributionItemDto) => {
        const percent = total > 0 ? (record.count / total) * 100 : 0;
        return `${percent.toFixed(2)}%`;
      }
    }
  ];

  return (
    <Card 
      title={<Title level={5} style={{ margin: 0 }}>{title}</Title>} 
      bordered={false}
      style={{ height: '100%', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', borderRadius: 12 }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px' }}>
        {/* Диаграмма */}
        <div style={{ flex: '1 1 300px', minWidth: 300, height: 350 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
                nameKey="name"
                label={({ name, percent }: any) => `${name || 'Неизвестно'} (${((percent || 0) * 100).toFixed(0)}%)`}
              >
                {chartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value: any) => [Number(value).toLocaleString('ru-RU'), 'Количество']}
                contentStyle={{ borderRadius: 8 }}
              />
              <Legend verticalAlign="bottom" height={36}/>
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Таблица */}
        <div style={{ flex: '1 1 300px', minWidth: 300 }}>
          <Table 
            dataSource={data}
            columns={columns}
            rowKey="category"
            size="small"
            pagination={{ pageSize: 5 }}
          />
        </div>
      </div>
    </Card>
  );
};
