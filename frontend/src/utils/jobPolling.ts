import type { SpikeResponse } from '../types/analytics.types';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class AnalysisJobCancelledError extends Error {
  readonly cancelled = true;

  constructor(message = 'Анализ отменён пользователем.') {
    super(message);
    this.name = 'AnalysisJobCancelledError';
  }
}

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
  partialIntervalMs?: number;
  attach?: boolean;
  initialProgress?: number;
  shouldFetchPartial?: () => boolean;
}

export async function pollAnalysisJob(
  jobId: string,
  api: AnalysisJobApi,
  options: PollAnalysisJobOptions = {},
): Promise<SpikeResponse> {
  const interval = options.pollIntervalMs ?? 3000;
  const partialInterval = options.partialIntervalMs ?? 8000;
  let lastPartialCount = 0;
  let lastPartialFetchAt = 0;
  let lastReportedProgress = -1;

  while (true) {
    await sleep(interval);
    const status = await api.getJobStatus(jobId);
    const progress = status.progress ?? 0;

    if (
      progress !== lastReportedProgress
      && (progress - lastReportedProgress >= 5 || progress >= 99 || lastReportedProgress < 0)
    ) {
      lastReportedProgress = progress;
      options.onProgress?.(progress);
    }

    if (status.status === 'Running' && api.getJobPartialResult) {
      const now = Date.now();
      const mayFetchPartial = !options.shouldFetchPartial || options.shouldFetchPartial();
      if (mayFetchPartial && now - lastPartialFetchAt >= partialInterval) {
        try {
          const partial = await api.getJobPartialResult(jobId);
          if (partial.series.length > 0 && partial.series.length !== lastPartialCount) {
            lastPartialCount = partial.series.length;
            lastPartialFetchAt = now;
            options.onPartialResult?.(partial);
          }
        } catch {
          // Partial file may not exist yet after the first batch.
        }
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

    if (status.status === 'Cancelled') {
      throw new AnalysisJobCancelledError(status.errorMessage);
    }
  }
}
