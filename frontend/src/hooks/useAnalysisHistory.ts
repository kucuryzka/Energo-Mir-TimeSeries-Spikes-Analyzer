import { useCallback, useState } from 'react';
import { message } from 'antd';
import { useRegisterShellRailActions } from '../context/ShellRailContext';

interface UseAnalysisHistoryParams {
  fetchHistory: () => Promise<any[]>;
  deleteHistoryApi: (jobId: string) => Promise<void>;
  visible: boolean;
}

export function useAnalysisHistory({ fetchHistory, deleteHistoryApi, visible }: UseAnalysisHistoryParams) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const openHistory = useCallback(async () => {
    setHistoryOpen(true);
    setLoadingHistory(true);
    try {
      const hist = await fetchHistory();
      setHistoryList(hist);
    } catch {
      message.error('Ошибка загрузки истории');
    } finally {
      setLoadingHistory(false);
    }
  }, [fetchHistory]);

  useRegisterShellRailActions({ onOpenHistory: openHistory }, visible);

  const deleteHistoryItem = async (jobId: string) => {
    try {
      await deleteHistoryApi(jobId);
      setHistoryList(prev => prev.filter(item => item.id !== jobId));
      message.success('Удалено');
    } catch {
      message.error('Ошибка удаления');
    }
  };

  return { historyOpen, setHistoryOpen, historyList, setHistoryList, loadingHistory, openHistory, deleteHistoryItem };
}
