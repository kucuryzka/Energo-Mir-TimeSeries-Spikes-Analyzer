import { useCallback, useState } from 'react';
import { message } from 'antd';
import { analysisJobsApi } from '../api/analysisJobsApi';
import { cancelAnalysisSessionJob } from '../store/analysisSessionStore';

/**
 * Отмена текущей задачи и экспорт результата в Excel — общая логика
 * телеметрии и generic-анализатора. Поведение и тексты сообщений идентичны
 * исходным обработчикам в этих компонентах.
 */
export function useAnalysisJobActions(
  sessionKey: string,
  jobId: string | null,
  loading: boolean,
  isPartialResult: boolean,
) {
  const [cancellingJob, setCancellingJob] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleCancelJob = useCallback(async () => {
    if (!jobId) return;
    setCancellingJob(true);
    try {
      await analysisJobsApi.cancel(jobId);
      cancelAnalysisSessionJob(sessionKey);
      message.info('Анализ останавливается…');
    } catch (e) {
      console.error(e);
      message.error('Не удалось отменить задачу');
    } finally {
      setCancellingJob(false);
    }
  }, [jobId, sessionKey]);

  const handleExport = async (options?: { loadDistribution?: boolean }) => {
    if (!jobId) {
      message.warning('Нет завершённого анализа для экспорта.');
      return;
    }
    if (isPartialResult || loading) {
      message.warning('Дождитесь завершения анализа перед экспортом.');
      return;
    }

    setExporting(true);
    try {
      await analysisJobsApi.downloadExport(jobId, options?.loadDistribution ?? false);
      message.success('Данные экспортированы в Excel');
    } catch (err: any) {
      const errorText = err?.message || err?.response?.data?.message || 'Не удалось скачать Excel';
      message.error(errorText);
    } finally {
      setExporting(false);
    }
  };

  return { cancellingJob, handleCancelJob, exporting, handleExport };
}
