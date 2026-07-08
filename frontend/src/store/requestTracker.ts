export type RequestStatus = 'pending' | 'success' | 'error';

export interface RequestRecord {
  id: string;
  url: string;
  method: string;
  startTime: number;
  endTime?: number;
  status: RequestStatus;
  errorMessage?: string;
}

type Listener = () => void;

class RequestTracker {
  private requests: Map<string, RequestRecord> = new Map();
  private listeners: Set<Listener> = new Set();
  private static readonly MAX_REQUESTS = 200;

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(listener => listener());
  }

  getRequests(): RequestRecord[] {
    return Array.from(this.requests.values()).sort((a, b) => b.startTime - a.startTime);
  }

  getActiveCount(): number {
    return Array.from(this.requests.values()).filter(r => r.status === 'pending').length;
  }

  startRequest(id: string, url: string, method: string) {
    this.requests.set(id, {
      id,
      url,
      method,
      startTime: Date.now(),
      status: 'pending'
    });
    this.pruneOldRequests();
    this.notify();
  }

  private pruneOldRequests() {
    if (this.requests.size <= RequestTracker.MAX_REQUESTS) return;
    const sorted = Array.from(this.requests.values()).sort((a, b) => a.startTime - b.startTime);
    const removeCount = this.requests.size - RequestTracker.MAX_REQUESTS;
    for (let i = 0; i < removeCount; i += 1) {
      this.requests.delete(sorted[i].id);
    }
  }

  endRequest(id: string, status: 'success' | 'error', errorMessage?: string) {
    const record = this.requests.get(id);
    if (record) {
      record.status = status;
      record.endTime = Date.now();
      record.errorMessage = errorMessage;
      this.notify();
    }
  }

  clear() {
    this.requests.clear();
    this.notify();
  }
}

export const requestTracker = new RequestTracker();
