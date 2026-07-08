import React from 'react';
import { AnalysisJobQueue } from './AnalysisJobQueue';

interface AnalysisJobQueuePageProps {
  active: boolean;
}

export const AnalysisJobQueuePage: React.FC<AnalysisJobQueuePageProps> = ({ active }) => {
  if (!active) return null;

  return (
    <div className="analysis-queue-page">
      <div className="analysis-queue-page__header">
        <h1 className="analysis-queue-page__title">Очередь анализа</h1>
        <p className="analysis-queue-page__subtitle">
          Активные и ожидающие задачи. Обновление каждые 3 секунды.
        </p>
      </div>
      <AnalysisJobQueue
        enabled={active}
        showWhenEmpty
        showDatabaseColumn
      />
    </div>
  );
};
