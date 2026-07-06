import { apiClient } from './index';
import type { DetectSpikesRequest, SpikeResponse, ChannelDto, DataSourceDto, DistributionItemDto, ChannelContributionDto } from '../types/analytics.types';
import { apiCache } from '../store/apiCache';
import { pollAnalysisJob, type AnalysisJobApi } from '../utils/jobPolling';
import { isMockMode } from '../mocks/mockMode';
import {
  mockSources,
  mockChannels,
  mockDistributionCategories,
  generateMockSpikeResponse,
  mockTablePreview,
  mockPointDetailsRows,
  mockPointChannels,
  mockHistoryList,
} from '../mocks/mockData';

const USE_MOCK = false;
const mockDelay = (ms: number = 300) => new Promise(resolve => setTimeout(resolve, ms));
const dayjsNowIso = () => new Date().toISOString();
const dayjsSubtractIso = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

async function mockRunAnalysis(
  request: DetectSpikesRequest,
  onProgress?: (progress: number) => void,
  onPartialResult?: (result: SpikeResponse) => void,
): Promise<SpikeResponse> {
  onProgress?.(30);
  await mockDelay(250);
  onProgress?.(70);
  await mockDelay(250);
  const result = generateMockSpikeResponse(request.startDate, request.endDate);
  onPartialResult?.(result);
  onProgress?.(100);
  await mockDelay(150);
  return result;
}

async function pollJobResult(
  api: AnalysisJobApi,
  jobId: string,
  onProgress?: (progress: number) => void,
  onPartialResult?: (result: SpikeResponse) => void,
): Promise<SpikeResponse> {
  return pollAnalysisJob(jobId, api, { onProgress, onPartialResult });
}

export const analyticsApi = {
  getSources: async (): Promise<DataSourceDto[]> => {
    if (USE_MOCK) return [{ id: 'mock', name: 'Мок источник', supportedDistributions: ['MockCategory'] }];
    if (isMockMode()) { await mockDelay(); return mockSources; }
    const response = await apiClient.get<DataSourceDto[]>('/sources');
    return response.data;
  },

  emProtocol: {
    getDistribution: async (database: string, startDate: string, endDate: string, categoryName: string): Promise<DistributionItemDto[]> => {
      if (isMockMode()) { await mockDelay(); return mockDistributionCategories[categoryName] ?? []; }
      const response = await apiClient.get<DistributionItemDto[]>('/em-protocol/distribution', {
        params: { database, startDate, endDate, categoryName }
      });
      return response.data;
    },
    getChannels: async (database: string, search?: string, page: number = 1, pageSize: number = 50): Promise<ChannelDto[]> => {
      if (isMockMode()) {
        await mockDelay();
        return search ? mockChannels.filter(c => c.name.toLowerCase().includes(search.toLowerCase())) : mockChannels;
      }
      const response = await apiClient.get<ChannelDto[]>('/em-protocol/channels', {
        params: { database, search, page, pageSize }
      });
      return response.data;
    },
    enqueueAnalysis: async (request: DetectSpikesRequest): Promise<{ jobId: string }> => {
      const response = await apiClient.post<{ jobId: string }>('/em-protocol/enqueue', request, {
        headers: { 'Content-Type': 'application/json' }
      });
      return response.data;
    },
    runAnalysis: async (
      request: DetectSpikesRequest,
      onProgress?: (progress: number) => void,
      onPartialResult?: (result: SpikeResponse) => void,
    ): Promise<SpikeResponse> => {
      if (isMockMode()) return mockRunAnalysis(request, onProgress, onPartialResult);
      const { jobId } = await analyticsApi.emProtocol.enqueueAnalysis(request);
      return pollJobResult(
        {
          getJobStatus: analyticsApi.emProtocol.getJobStatus,
          getJobResult: analyticsApi.emProtocol.getJobResult,
          getJobPartialResult: analyticsApi.emProtocol.getJobPartialResult,
        },
        jobId,
        onProgress,
        onPartialResult,
      );
    },
    getJobStatus: async (jobId: string): Promise<any> => {
      const response = await apiClient.get<any>(`/em-protocol/status/${jobId}`);
      return response.data;
    },
    getJobResult: async (jobId: string): Promise<SpikeResponse> => {
      if (isMockMode()) { await mockDelay(); return generateMockSpikeResponse(dayjsSubtractIso(7), dayjsNowIso()); }
      const response = await apiClient.get<SpikeResponse>(`/em-protocol/result/${jobId}`);
      return response.data;
    },
    getJobPartialResult: async (jobId: string): Promise<SpikeResponse> => {
      const response = await apiClient.get<SpikeResponse>(`/em-protocol/partial-result/${jobId}`);
      return response.data;
    },
    getHistory: async (database: string): Promise<any[]> => {
      if (isMockMode()) { await mockDelay(); return mockHistoryList(); }
      const response = await apiClient.get<any[]>('/em-protocol/history', { params: { database } });
      return response.data;
    },
    deleteHistoryItem: async (jobId: string): Promise<void> => {
      if (isMockMode()) { await mockDelay(); return; }
      await apiClient.delete(`/em-protocol/history/${jobId}`);
    },
    getTablePreview: async (database: string, limit = 15): Promise<any> => {
      if (isMockMode()) { await mockDelay(); return mockTablePreview('InsertTime'); }
      const response = await apiClient.get('/em-protocol/preview', { params: { database, limit } });
      return response.data;
    },
    getPointChannels: async (
      database: string,
      timestamp: string,
      granularity: string,
      customMinutes?: number,
      channelId?: number
    ): Promise<ChannelContributionDto[]> => {
      if (isMockMode()) { await mockDelay(); return mockPointChannels(); }
      const params = { database, timestamp, granularity, customMinutes, channelId };
      const response = await apiClient.get<ChannelContributionDto[]>('/em-protocol/point-channels', { params });
      return response.data;
    }
  },

  dbo: {
    enqueueAnalysis: async (request: DetectSpikesRequest): Promise<{ jobId: string }> => {
      const response = await apiClient.post<{ jobId: string }>('/dbo/enqueue', request, {
        headers: { 'Content-Type': 'application/json' }
      });
      return response.data;
    },
    runAnalysis: async (
      request: DetectSpikesRequest,
      onProgress?: (progress: number) => void,
      onPartialResult?: (result: SpikeResponse) => void,
    ): Promise<SpikeResponse> => {
      if (isMockMode()) return mockRunAnalysis(request, onProgress, onPartialResult);
      const { jobId } = await analyticsApi.dbo.enqueueAnalysis(request);
      return pollJobResult(
        {
          getJobStatus: analyticsApi.dbo.getJobStatus,
          getJobResult: analyticsApi.dbo.getJobResult,
          getJobPartialResult: analyticsApi.dbo.getJobPartialResult,
        },
        jobId,
        onProgress,
        onPartialResult,
      );
    },
    getJobStatus: async (jobId: string): Promise<any> => {
      const response = await apiClient.get<any>(`/dbo/status/${jobId}`);
      return response.data;
    },
    getJobResult: async (jobId: string): Promise<SpikeResponse> => {
      if (isMockMode()) { await mockDelay(); return generateMockSpikeResponse(dayjsSubtractIso(7), dayjsNowIso()); }
      const response = await apiClient.get<SpikeResponse>(`/dbo/result/${jobId}`);
      return response.data;
    },
    getJobPartialResult: async (jobId: string): Promise<SpikeResponse> => {
      const response = await apiClient.get<SpikeResponse>(`/dbo/partial-result/${jobId}`);
      return response.data;
    },
    getHistory: async (database: string): Promise<any[]> => {
      if (isMockMode()) { await mockDelay(); return mockHistoryList(); }
      const response = await apiClient.get<any[]>('/dbo/history', { params: { database } });
      return response.data;
    },
    deleteHistoryItem: async (jobId: string): Promise<void> => {
      if (isMockMode()) { await mockDelay(); return; }
      await apiClient.delete(`/dbo/history/${jobId}`);
    },
    getObjects: async (database: string, search?: string, page: number = 1, pageSize: number = 50): Promise<ChannelDto[]> => {
      if (isMockMode()) {
        await mockDelay();
        return search ? mockChannels.filter(c => c.name.toLowerCase().includes(search.toLowerCase())) : mockChannels;
      }
      const response = await apiClient.get<ChannelDto[]>('/dbo/objects', {
        params: { database, search, page, pageSize }
      });
      return response.data;
    },
    getTablePreview: async (database: string, limit = 15): Promise<any> => {
      if (isMockMode()) { await mockDelay(); return mockTablePreview('TIME_INSERT'); }
      const response = await apiClient.get('/dbo/preview', { params: { database, limit } });
      return response.data;
    },
    getPointDetails: async (database: string, timestamp: string, granularity: string, customMinutes?: number, channelId?: number): Promise<any[]> => {
      if (isMockMode()) { await mockDelay(); return mockPointDetailsRows(); }
      const params = { database, timestamp, granularity, customMinutes, channelId };
      const cached = apiCache.get('/dbo/point-details', params, undefined);
      if (cached) return cached;
      const response = await apiClient.get<any[]>('/dbo/point-details', { params });
      apiCache.set('/dbo/point-details', params, undefined, response.data);
      return response.data;
    },
    getPointChannels: async (
      database: string,
      timestamp: string,
      granularity: string,
      customMinutes?: number,
      channelId?: number
    ): Promise<ChannelContributionDto[]> => {
      if (isMockMode()) { await mockDelay(); return mockPointChannels(); }
      const params = { database, timestamp, granularity, customMinutes, channelId };
      const response = await apiClient.get<ChannelContributionDto[]>('/dbo/point-channels', { params });
      return response.data;
    }
  }
};
