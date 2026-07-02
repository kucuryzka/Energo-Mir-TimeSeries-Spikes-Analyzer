import { apiClient } from './index';
import { apiCache } from '../store/apiCache';

export const authApi = {
  connect: async (data: any) => {
    const res = await apiClient.post('/auth/connect', data);
    return res.data;
  }
};

export const explorerApi = {
  getDatabases: async () => {
    const res = await apiClient.get('/explorer/databases');
    return res.data;
  },
  getSchemas: async (db: string) => {
    const res = await apiClient.get('/explorer/schemas', { params: { database: db } });
    return res.data;
  },
  getTables: async (db: string, schema: string) => {
    const res = await apiClient.get('/explorer/tables', { params: { database: db, schema } });
    return res.data;
  },
  getColumns: async (db: string, schema: string, table: string) => {
    const res = await apiClient.get('/explorer/columns', { params: { database: db, schema, table } });
    return res.data;
  }
};

export const genericAnalysisApi = {
  analyze: async (data: any) => {
    const cached = apiCache.get('/GenericAnalysis/analyze', undefined, data);
    if (cached) return cached;
    const res = await apiClient.post('/GenericAnalysis/analyze', data);
    apiCache.set('/GenericAnalysis/analyze', undefined, data, res.data);
    return res.data;
  },
  getPointDetails: async (database: string, schema: string, table: string, timeColumn: string, timestamp: string, granularity: string, customMinutes?: number | null) => {
    const params = { database, schema, table, timeColumn, timestamp, granularity, customMinutes };
    const cached = apiCache.get('/GenericAnalysis/point-details', params, undefined);
    if (cached) return cached;
    const res = await apiClient.get('/GenericAnalysis/point-details', { params });
    apiCache.set('/GenericAnalysis/point-details', params, undefined, res.data);
    return res.data;
  }
};
