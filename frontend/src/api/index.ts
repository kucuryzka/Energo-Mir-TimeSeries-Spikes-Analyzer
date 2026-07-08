import axios from 'axios';
import { requestTracker } from '../store/requestTracker';

/** Префикс API за nginx: /api/dist/api/... → backend /api/... */
export const API_BASE_PATH = import.meta.env.VITE_API_BASE_PATH ?? '/api/dist/api';

/** Hangfire на backend в /hangfire, за nginx — /api/dist/hangfire */
export const HANGFIRE_PATH = import.meta.env.VITE_HANGFIRE_PATH ?? '/api/dist/hangfire/';

export const apiClient = axios.create({
  baseURL: API_BASE_PATH,
});

const generateId = () => Math.random().toString(36).substring(2, 9);

apiClient.interceptors.request.use(config => {
  // Относительные пути без ведущего /, иначе axios игнорирует baseURL
  if (config.url?.startsWith('/')) {
    config.url = config.url.slice(1);
  }

  const token = localStorage.getItem('dbToken');
  if (token) {
    config.headers['X-Session-Token'] = token;
  }

  const requestId = generateId();
  (config as { requestId?: string }).requestId = requestId;
  requestTracker.startRequest(requestId, config.url || '', config.method || 'get');

  return config;
});

apiClient.interceptors.response.use(
  response => {
    const requestId = (response.config as { requestId?: string }).requestId;
    if (requestId) {
      requestTracker.endRequest(requestId, 'success');
    }
    return response;
  },
  error => {
    const requestId = (error.config as { requestId?: string })?.requestId;
    if (requestId) {
      requestTracker.endRequest(requestId, 'error', error.message || 'Unknown error');
    }

    if (error.response?.data?.details === 'Invalid or missing session token' || error.response?.data?.message === 'Invalid or missing session token') {
      localStorage.removeItem('dbToken');
      window.location.reload();
    }
    return Promise.reject(error);
  }
);
