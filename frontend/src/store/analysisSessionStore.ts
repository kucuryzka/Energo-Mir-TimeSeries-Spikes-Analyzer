import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpikeResponse } from '../types/analytics.types';
import { pollAnalysisJob, type AnalysisJobApi, type PollAnalysisJobOptions, AnalysisJobCancelledError } from '../utils/jobPolling';

export interface AnalysisSessionSnapshot {
  loading: boolean;
  progress: number;
  error: string | null;
  jobId: string | null;
}

const EMPTY_SESSION: AnalysisSessionSnapshot = {
  loading: false,
  progress: 0,
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

export function cancelAnalysisSessionJob(key: string) {
  pollGeneration.set(key, (pollGeneration.get(key) ?? 0) + 1);
  patchSession(key, { loading: false, progress: 0, error: null });
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
    progress: options.attach ? (options.initialProgress ?? 0) : 0,
    error: null,
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
      options.onPartialResult?.(result);
    },
  })
    .then((result) => {
      if (pollGeneration.get(key) !== generation) return result;
      patchSession(key, {
        loading: false,
        progress: 100,
        jobId,
      });
      return result;
    })
    .catch((err: unknown) => {
      if (pollGeneration.get(key) !== generation) throw err;
      if (err instanceof AnalysisJobCancelledError) {
        patchSession(key, { loading: false, error: null });
        throw err;
      }
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

export function useAnalysisResultData(
  sessionKey: string,
  visible: boolean,
  api: AnalysisJobApi,
) {
  const session = useAnalysisSession(sessionKey);
  const [data, setData] = useState<SpikeResponse | null>(null);
  const [isPartialResult, setIsPartialResult] = useState(false);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  useEffect(() => {
    if (!visible) {
      setData(null);
      setIsPartialResult(false);
      return;
    }
    if (!session.jobId) return;
    // Re-attach after tab was hidden while the job kept running on the server.
    if (session.loading) {
      let cancelled = false;
      (async () => {
        if (!api.getJobPartialResult) return;
        try {
          const partial = await api.getJobPartialResult(session.jobId!);
          if (!cancelled && partial?.series?.length) {
            setData(partial);
            setIsPartialResult(true);
          }
        } catch {
          // partial may not exist yet
        }
      })();
      return () => { cancelled = true; };
    }
    if (data?.series?.length) return;

    let cancelled = false;

    const load = async () => {
      try {
        const status = await api.getJobStatus(session.jobId!);
        if (cancelled) return;

        if (status.status === 'Running' || session.loading) {
          if (!api.getJobPartialResult) return;
          try {
            const partial = await api.getJobPartialResult(session.jobId!);
            if (!cancelled && partial?.series?.length) {
              setData(partial);
              setIsPartialResult(true);
            }
          } catch {
            // partial file may not exist yet
          }
          return;
        }

        if (status.status === 'Cancelled') {
          if (!api.getJobPartialResult) return;
          try {
            const partial = await api.getJobPartialResult(session.jobId!);
            if (!cancelled && partial?.series?.length) {
              setData(partial);
              setIsPartialResult(true);
            }
          } catch {
            // no partial saved
          }
          return;
        }

        if (status.status === 'Completed') {
          const result = await api.getJobResult(session.jobId!);
          if (!cancelled) {
            setData(result);
            setIsPartialResult(false);
          }
        }
      } catch (err) {
        console.error('Failed to load analysis result', err);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [visible, session.jobId, session.loading, api, data?.series?.length]);

  const applyLoadedResult = useCallback((result: SpikeResponse, isPartial: boolean) => {
    setData(result);
    setIsPartialResult(isPartial);
  }, []);

  const applyPartialResult = useCallback((partial: SpikeResponse) => {
    if (!visibleRef.current) return;
    setData(prev => {
      const prevLen = prev?.series?.length ?? 0;
      const nextLen = partial.series.length;
      if (prev && nextLen <= prevLen) return prev;
      return partial;
    });
    setIsPartialResult(true);
  }, []);

  const applyFinalResult = useCallback((result: SpikeResponse) => {
    if (!visibleRef.current) return;
    setData(result);
    setIsPartialResult(false);
  }, []);

  return {
    ...session,
    data,
    isPartialResult,
    setData,
    applyPartialResult,
    applyFinalResult,
    applyLoadedResult,
  };
}
