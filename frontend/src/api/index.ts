import axios from 'axios';
import { requestTracker } from '../store/requestTracker';

// Используем HTTP, порт 5090 (из launchSettings.json)
export const API_BASE_URL = 'http://localhost:5090';

export const apiClient = axios.create({
  baseURL: API_BASE_URL + '/api',
});

// Generate a simple unique ID
const generateId = () => Math.random().toString(36).substring(2, 9);

apiClient.interceptors.request.use(config => {
  const token = localStorage.getItem('dbToken');
  if (token) {
    config.headers['X-Session-Token'] = token;
  }
  
  // Create an ID for the request
  const requestId = generateId();
  (config as any).requestId = requestId;
  requestTracker.startRequest(requestId, config.url || '', config.method || 'get');

  return config;
});

apiClient.interceptors.response.use(
  response => {
    const requestId = (response.config as any).requestId;
    if (requestId) {
      requestTracker.endRequest(requestId, 'success');
    }
    return response;
  },
  error => {
    const requestId = (error.config as any)?.requestId;
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
