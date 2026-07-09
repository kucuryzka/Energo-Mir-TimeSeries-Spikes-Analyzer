import { useCallback, useState } from 'react';
import { message } from 'antd';
import { useRegisterShellRailActions } from '../context/ShellRailContext';

interface UseAnalysisHistoryParams {
  /** Загрузчик списка истории (мемоизировать в вызывающем компоненте). */
  fetchHistory: () => Promise<any[]>;
  /** Удаление записи истории на бэкенде. */
  deleteHistoryApi: (jobId: string) => Promise<void>;
  /** Регистрировать действие «Открыть историю» в боковой панели только когда экран видим. */
  visible: boolean;
}

/**
 * Drawer истории фоновых задач: состояние открытия/списка/загрузки, ленивое
 * получение при открытии, регистрация действия в ShellRail и удаление записи.
 * Логика и тексты сообщений идентичны прежним обработчикам в обоих экранах.
 * Конкретная загрузка результата (loadHistoryItem) остаётся в компоненте — она
 * различается между телеметрией и generic-анализатором.
 */
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
