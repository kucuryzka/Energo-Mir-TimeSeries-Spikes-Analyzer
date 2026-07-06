import type { SpikeResponse } from '../types/analytics.types';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface AnalysisJobApi {
  getJobStatus: (jobId: string) => Promise<{
    status: string;
    progress?: number;
    errorMessage?: string;
    hasResult?: boolean;
    hasPartialResult?: boolean;
  }>;
  getJobResult: (jobId: string) => Promise<SpikeResponse>;
  getJobPartialResult?: (jobId: string) => Promise<SpikeResponse>;
}

export interface PollAnalysisJobOptions {
  onProgress?: (progress: number) => void;
  onPartialResult?: (result: SpikeResponse) => void;
  pollIntervalMs?: number;
}

export async function pollAnalysisJob(
  jobId: string,
  api: AnalysisJobApi,
  options: PollAnalysisJobOptions = {},
): Promise<SpikeResponse> {
  const interval = options.pollIntervalMs ?? 1500;
  let lastPartialCount = 0;

  while (true) {
    await sleep(interval);
    const status = await api.getJobStatus(jobId);
    options.onProgress?.(status.progress ?? 0);

    if (status.status === 'Running' && api.getJobPartialResult) {
      try {
        const partial = await api.getJobPartialResult(jobId);
        if (partial.series.length > 0 && partial.series.length !== lastPartialCount) {
          lastPartialCount = partial.series.length;
          options.onPartialResult?.(partial);
        }
      } catch {
        // Partial file may not exist yet after the first batch.
      }
    }

    if (status.status === 'Completed') {
      if (status.hasResult === false) {
        throw new Error(
          status.errorMessage
            || 'Результат анализа недоступен. Возможно, сервер был перезапущен — запустите анализ заново.',
        );
      }
      return api.getJobResult(jobId);
    }

    if (status.status === 'Failed') {
      throw new Error(status.errorMessage || 'Analysis job failed');
    }
  }
}
