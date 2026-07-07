import { useEffect, useState } from 'react';
import type { SpikeResponse } from '../types/analytics.types';
import { pollAnalysisJob, type AnalysisJobApi, type PollAnalysisJobOptions } from '../utils/jobPolling';

export interface AnalysisSessionSnapshot {
  loading: boolean;
  progress: number;
  data: SpikeResponse | null;
  isPartialResult: boolean;
  error: string | null;
  jobId: string | null;
}

const EMPTY_SESSION: AnalysisSessionSnapshot = {
  loading: false,
  progress: 0,
  data: null,
  isPartialResult: false,
  error: null,
  jobId: null,
};

const sessions = new Map<string, AnalysisSessionSnapshot>();
const listeners = new Map<string, Set<(snapshot: AnalysisSessionSnapshot) => void>>();
const pollGeneration = new Map<string, number>();

function getOrCreateSession(key: string): AnalysisSessionSnapshot {
  if (!sessions.has(key)) {
    sessions.set(key, { ...EMPTY_SESSION });
  }
  return sessions.get(key)!;
}

function notify(key: string) {
  const snapshot = getOrCreateSession(key);
  listeners.get(key)?.forEach(cb => cb(snapshot));
}

function patchSession(key: string, patch: Partial<AnalysisSessionSnapshot>) {
  sessions.set(key, { ...getOrCreateSession(key), ...patch });
  notify(key);
}

export function subscribeAnalysisSession(key: string, listener: (snapshot: AnalysisSessionSnapshot) => void) {
  const set = listeners.get(key) ?? new Set();
  set.add(listener);
  listeners.set(key, set);
  listener(getOrCreateSession(key));
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(key);
  };
}

export function runAnalysisSessionJob(
  key: string,
  jobId: string,
  api: AnalysisJobApi,
  options: PollAnalysisJobOptions = {},
): Promise<SpikeResponse> {
  const generation = (pollGeneration.get(key) ?? 0) + 1;
  pollGeneration.set(key, generation);

  patchSession(key, {
    loading: true,
    jobId,
    progress: 0,
    error: null,
    data: null,
    isPartialResult: false,
  });

  return pollAnalysisJob(jobId, api, {
    ...options,
    onProgress: (progress) => {
      if (pollGeneration.get(key) !== generation) return;
      patchSession(key, { progress });
      options.onProgress?.(progress);
    },
    onPartialResult: (result) => {
      if (pollGeneration.get(key) !== generation) return;
      patchSession(key, { data: result, isPartialResult: true });
      options.onPartialResult?.(result);
    },
  })
    .then((result) => {
      if (pollGeneration.get(key) !== generation) return result;
      patchSession(key, {
        loading: false,
        data: result,
        isPartialResult: false,
        progress: 100,
        jobId,
      });
      return result;
    })
    .catch((err: unknown) => {
      if (pollGeneration.get(key) !== generation) throw err;
      const message = err instanceof Error ? err.message : String(err);
      patchSession(key, { loading: false, error: message });
      throw err;
    });
}

export function clearAnalysisSession(key: string) {
  pollGeneration.set(key, (pollGeneration.get(key) ?? 0) + 1);
  sessions.set(key, { ...EMPTY_SESSION });
  notify(key);
}

export function updateAnalysisSession(key: string, patch: Partial<AnalysisSessionSnapshot>) {
  patchSession(key, patch);
}

export function useAnalysisSession(sessionKey: string): AnalysisSessionSnapshot {
  const [snapshot, setSnapshot] = useState<AnalysisSessionSnapshot>(() => getOrCreateSession(sessionKey));

  useEffect(() => subscribeAnalysisSession(sessionKey, setSnapshot), [sessionKey]);

  return snapshot;
}
