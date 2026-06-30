import axios from 'axios';
import type { DetectSpikesRequest, SpikeResponse } from '../types/analytics.types';
import { mockData } from '../mocks/mockData';

// Используем HTTP, порт 5090 (из launchSettings.json)
const API_BASE_URL = 'http://localhost:5090';

// 👇 Переключатель: true = используем мок-данные, false = реальный бэкенд
const USE_MOCK = true;

export const analyticsApi = {
  detectSpikes: async (request: DetectSpikesRequest): Promise<SpikeResponse> => {
    // Если включен режим моков — возвращаем заглушку
    if (USE_MOCK) {
      await new Promise(resolve => setTimeout(resolve, 800));
      return mockData;
    }

    // Иначе — реальный запрос к бэкенду
    const response = await axios.post<SpikeResponse>(
      `${API_BASE_URL}/api/analytics/detect-spikes`,
      request,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data;
  },
};
