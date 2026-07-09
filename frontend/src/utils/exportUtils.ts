import dayjs from 'dayjs';
import { genericAnalysisApi } from '../api/explorerApi';


export const exportSpikesToExcel = async (
  jobId: string,
  filename?: string
): Promise<void> => {

  const blob = await genericAnalysisApi.exportExcel(jobId);

  const url = window.URL.createObjectURL(blob);

  const link = document.createElement('a');

  link.href = url;

  link.download =
    filename ??
    `spike-analysis-${dayjs().format('YYYY-MM-DD_HHmm')}.xlsx`;

  document.body.appendChild(link);

  link.click();

  document.body.removeChild(link);

  window.URL.revokeObjectURL(url);
};