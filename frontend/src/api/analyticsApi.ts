import axios from 'axios';
import type { DetectSpikesRequest, SpikeResponse, ChannelDto, DataSourceDto } from '../types/analytics.types';
import { mockData } from '../mocks/mockData';

// Используем HTTP, порт 5090 (из launchSettings.json)
const API_BASE_URL = 'http://localhost:5090';

// 👇 Переключатель: true = используем мок-данные, false = реальный бэкенд
const USE_MOCK = false;

export const analyticsApi = {
  getSources: async (): Promise<DataSourceDto[]> => {
    if (USE_MOCK) {
      return [{ id: 'mock', name: 'Мок источник' }];
    }
    const response = await axios.get<DataSourceDto[]>(`${API_BASE_URL}/api/analytics/sources`);
    return response.data;
  },

  getChannels: async (sourceId: string, search?: string, page: number = 1, pageSize: number = 50): Promise<ChannelDto[]> => {
    if (USE_MOCK) {
      return [
        { id: 1, name: 'Мок-канал 1' },
        { id: 2, name: 'Мок-канал 2' },
      ];
    }
    const response = await axios.get<ChannelDto[]>(`${API_BASE_URL}/api/analytics/channels`, {
      params: { sourceId, search, page, pageSize }
    });
    return response.data;
  },

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
