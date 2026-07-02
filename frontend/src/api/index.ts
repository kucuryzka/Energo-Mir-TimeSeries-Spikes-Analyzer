import axios from 'axios';

// Используем HTTP, порт 5090 (из launchSettings.json)
export const API_BASE_URL = 'http://localhost:5090';

export const apiClient = axios.create({
  baseURL: API_BASE_URL + '/api',
});

apiClient.interceptors.request.use(config => {
  const token = localStorage.getItem('dbToken');
  if (token) {
    config.headers['X-Session-Token'] = token;
  }
  return config;
});

apiClient.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.data?.details === 'Invalid or missing session token' || error.response?.data?.message === 'Invalid or missing session token') {
      localStorage.removeItem('dbToken');
      window.location.reload();
    }
    return Promise.reject(error);
  }
);
