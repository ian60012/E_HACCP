import apiClient from './client';
import { MixingLog, MixingLogCreate, MixingLogUpdate } from '@/types/mixing-log';
import { PaginatedResponse, VoidRequest } from '@/types/common';

export const mixingLogsApi = {
  list: async (params?: { skip?: number; limit?: number; is_voided?: boolean; prod_batch_id?: number }): Promise<PaginatedResponse<MixingLog>> => {
    const response = await apiClient.get<PaginatedResponse<MixingLog>>('/api/v1/mixing-logs', { params });
    return response.data;
  },

  get: async (id: number): Promise<MixingLog> => {
    const response = await apiClient.get<MixingLog>(`/api/v1/mixing-logs/${id}`);
    return response.data;
  },

  create: async (data: MixingLogCreate): Promise<MixingLog> => {
    const response = await apiClient.post<MixingLog>('/api/v1/mixing-logs', data);
    return response.data;
  },

  update: async (id: number, data: MixingLogUpdate): Promise<MixingLog> => {
    const response = await apiClient.patch<MixingLog>(`/api/v1/mixing-logs/${id}`, data);
    return response.data;
  },

  lock: async (id: number): Promise<MixingLog> => {
    const response = await apiClient.post<MixingLog>(`/api/v1/mixing-logs/${id}/lock`);
    return response.data;
  },

  void: async (id: number, data: VoidRequest): Promise<MixingLog> => {
    const response = await apiClient.post<MixingLog>(`/api/v1/mixing-logs/${id}/void`, data);
    return response.data;
  },
};
