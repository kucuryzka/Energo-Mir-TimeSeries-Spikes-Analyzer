import React from 'react';
import { Alert, Button, Progress, Spin } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';

interface AnalysisJobProgressProps {
  loading: boolean;
  progress: number;
  isPartialResult?: boolean;
  showSpinner?: boolean;
  jobId?: string | null;
  onCancel?: () => void;
  cancelling?: boolean;
}

export const AnalysisJobProgress: React.FC<AnalysisJobProgressProps> = ({
  loading,
  progress,
  isPartialResult = false,
  showSpinner = false,
  jobId,
  onCancel,
  cancelling = false,
}) => {
  if (!loading) return null;

  const antIcon = <LoadingOutlined style={{ fontSize: 32, color: '#3B65D9' }} spin />;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <Progress percent={progress} status="active" />
        </div>
        {jobId && onCancel && (
          <Button danger size="small" onClick={onCancel} loading={cancelling}>
            Остановить
          </Button>
        )}
      </div>
      {(isPartialResult || progress > 0) && (
        <Alert
          type="info"
          showIcon
          message="Загрузка данных по батчам"
          description="График обновляется по мере обработки каждого батча периода. Аномалии и KPI будут рассчитаны после завершения анализа."
          style={{ marginTop: 12, borderRadius: 12 }}
        />
      )}
      {showSpinner && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 20px' }}>
          <Spin indicator={antIcon} />
        </div>
      )}
    </div>
  );
};
