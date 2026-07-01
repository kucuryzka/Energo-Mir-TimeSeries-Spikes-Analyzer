import React from 'react';
import { StatCard } from './StatCard';
import './StatsGrid.css';

interface StatsGridProps {
  stats: {
    totalPoints: number;
    totalCalls: number;
    average: number;
    max: number;
    min: number;
    spikesCount: number;
    criticalSpikes: number;
  } | null;
}

export const StatsGrid: React.FC<StatsGridProps> = ({ stats }) => {
  const cards = [
    { title: 'Всего значений', value: stats?.totalPoints ?? '-' },
    { title: 'Обнаружено аномалий', value: stats?.spikesCount ?? '-' },
    { title: 'Критических аномалий', value: stats?.criticalSpikes ?? '-' },
    { title: 'Среднее значение', value: stats?.average ? stats.average.toFixed(2) : '-' },
    { title: 'Максимум', value: stats?.max ? stats.max.toFixed(2) : '-' },
    { title: 'Всего точек', value: stats?.totalPoints ?? '-' },
  ];

  return (
    <div className="stats-grid">
      {cards.map((card, idx) => (
        <StatCard key={idx} title={card.title} value={card.value} />
      ))}
    </div>
  );
};
