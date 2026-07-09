import { useCallback, useEffect, useState } from 'react';
import { message } from 'antd';
import type { TablePreviewData } from '../ui/TablePreviewCard';

/**
 * @param fetchPreview 
 * @param resetKey   
 */
export function useTablePreview(
  fetchPreview: () => Promise<TablePreviewData>,
  resetKey: string,
) {
  const [tablePreview, setTablePreview] = useState<TablePreviewData | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    setTablePreview(null);
    setPreviewOpen(false);
    setLoadingPreview(false);
  }, [resetKey]);

  const loadPreview = useCallback(async () => {
    setLoadingPreview(true);
    try {
      const preview = await fetchPreview();
      setTablePreview(preview);
    } catch (e) {
      console.error('Failed to load table preview', e);
      setTablePreview(null);
      message.error('Не удалось загрузить превью таблицы');
    } finally {
      setLoadingPreview(false);
    }
  }, [fetchPreview]);

  const handlePreviewToggle = useCallback(async () => {
    if (!previewOpen && !tablePreview && !loadingPreview) {
      await loadPreview();
    }
    setPreviewOpen(v => !v);
  }, [previewOpen, tablePreview, loadingPreview, loadPreview]);

  return { tablePreview, setTablePreview, loadingPreview, previewOpen, setPreviewOpen, handlePreviewToggle };
}
