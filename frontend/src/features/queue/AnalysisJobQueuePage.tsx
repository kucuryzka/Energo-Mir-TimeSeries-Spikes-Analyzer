import React from 'react';
import { AnalysisJobQueue } from './AnalysisJobQueue';
import type { PendingAnalysisJobOpen } from '../../utils/analysisJobLoader';

interface AnalysisJobQueuePageProps {
  active: boolean;
  onOpenJob?: (job: PendingAnalysisJobOpen) => void;
}

export const AnalysisJobQueuePage: React.FC<AnalysisJobQueuePageProps> = ({ active, onOpenJob }) => {
  if (!active) return null;

  return (
    <div className="analysis-queue-page">
      <div className="analysis-queue-page__header">
        <h1 className="analysis-queue-page__title">Очередь анализа</h1>
        <p className="analysis-queue-page__subtitle">
          Активные и недавно завершённые задачи. Обновление каждые 3 секунды.
        </p>
      </div>
      <AnalysisJobQueue
        enabled={active}
        showWhenEmpty
        showDatabaseColumn
        onOpenJob={onOpenJob}
      />
    </div>
  );
};
