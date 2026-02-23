import apiClient from './client';
import { CoolingLog, CoolingLogCreate, CoolingLogUpdate } from '@/types/cooling-log';
import { PaginatedResponse, VoidRequest } from '@/types/common';

export const coolingLogsApi = {
  list: async (params?: { skip?: number; limit?: number; is_voided?: boolean }): Promise<PaginatedResponse<CoolingLog>> => {
    const response = await apiClient.get<PaginatedResponse<CoolingLog>>('/api/v1/cooling-logs', { params });
    return response.data;
  },

  get: async (id: number): Promise<CoolingLog> => {
    const response = await apiClient.get<CoolingLog>(`/api/v1/cooling-logs/${id}`);
    return response.data;
  },

  create: async (data: CoolingLogCreate): Promise<CoolingLog> => {
    const response = await apiClient.post<CoolingLog>('/api/v1/cooling-logs', data);
    return response.data;
  },

  update: async (id: number, data: CoolingLogUpdate): Promise<CoolingLog> => {
    const response = await apiClient.patch<CoolingLog>(`/api/v1/cooling-logs/${id}`, data);
    return response.data;
  },

  lock: async (id: number): Promise<CoolingLog> => {
    const response = await apiClient.post<CoolingLog>(`/api/v1/cooling-logs/${id}/lock`);
    return response.data;
  },

  void: async (id: number, data: VoidRequest): Promise<CoolingLog> => {
    const response = await apiClient.post<CoolingLog>(`/api/v1/cooling-logs/${id}/void`, data);
    return response.data;
  },
};
