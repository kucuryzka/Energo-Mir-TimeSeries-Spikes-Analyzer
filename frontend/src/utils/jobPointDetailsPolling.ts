import { apiClient } from '../api/index';
import type { ChannelContributionDto } from '../types/analytics.types';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface JobPointDetailsStatus {
  status: 'loading' | 'complete' | 'failed';
  channelBreakdown: ChannelContributionDto[];
  meteringRows?: Record<string, unknown>[];
  errorMessage?: string | null;
}

export interface PollJobPointDetailsOptions {
  pollIntervalMs?: number;
  maxAttempts?: number;
  shouldContinue?: () => boolean;
  channelId?: number | null;
}

export async function pollJobPointDetails(
  jobId: string,
  timestamp: string,
  options: PollJobPointDetailsOptions = {},
): Promise<JobPointDetailsStatus> {
  const interval = options.pollIntervalMs ?? 3000;
  const maxAttempts = options.maxAttempts ?? 400;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (options.shouldContinue && !options.shouldContinue()) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const response = await apiClient.get<JobPointDetailsStatus>(
      `/analysis-jobs/${jobId}/point-details`,
      {
        params: {
          timestamp,
          ...(options.channelId != null ? { channelId: options.channelId } : {}),
        },
        validateStatus: (status: number) => status === 200 || status === 202,
      },
    );

    const data = response.data;
    if (data.status === 'complete' || data.status === 'failed') {
      return data;
    }

    await sleep(interval);
  }

  throw new Error('Превышено время ожидания детализации. Задача может ещё выполняться — смотрите очередь.');
}
