import apiClient from './client';
import { CookingLog, CookingLogCreate, CookingLogUpdate } from '@/types/cooking-log';
import { PaginatedResponse, VoidRequest } from '@/types/common';

export const cookingLogsApi = {
  list: async (params?: { skip?: number; limit?: number; is_voided?: boolean; batch_id?: string }): Promise<PaginatedResponse<CookingLog>> => {
    const response = await apiClient.get<PaginatedResponse<CookingLog>>('/api/v1/cooking-logs', { params });
    return response.data;
  },

  get: async (id: number): Promise<CookingLog> => {
    const response = await apiClient.get<CookingLog>(`/api/v1/cooking-logs/${id}`);
    return response.data;
  },

  create: async (data: CookingLogCreate): Promise<CookingLog> => {
    const response = await apiClient.post<CookingLog>('/api/v1/cooking-logs', data);
    return response.data;
  },

  update: async (id: number, data: CookingLogUpdate): Promise<CookingLog> => {
    const response = await apiClient.patch<CookingLog>(`/api/v1/cooking-logs/${id}`, data);
    return response.data;
  },

  lock: async (id: number): Promise<CookingLog> => {
    const response = await apiClient.post<CookingLog>(`/api/v1/cooking-logs/${id}/lock`);
    return response.data;
  },

  void: async (id: number, data: VoidRequest): Promise<CookingLog> => {
    const response = await apiClient.post<CookingLog>(`/api/v1/cooking-logs/${id}/void`, data);
    return response.data;
  },
};
