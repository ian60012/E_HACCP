import apiClient from './client';
import { SanitisingLog, SanitisingLogCreate, SanitisingLogUpdate } from '@/types/sanitising-log';
import { PaginatedResponse, VoidRequest } from '@/types/common';

export const sanitisingLogsApi = {
  list: async (params?: { skip?: number; limit?: number; is_voided?: boolean }): Promise<PaginatedResponse<SanitisingLog>> => {
    const response = await apiClient.get<PaginatedResponse<SanitisingLog>>('/api/v1/sanitising-logs', { params });
    return response.data;
  },

  get: async (id: number): Promise<SanitisingLog> => {
    const response = await apiClient.get<SanitisingLog>(`/api/v1/sanitising-logs/${id}`);
    return response.data;
  },

  create: async (data: SanitisingLogCreate): Promise<SanitisingLog> => {
    const response = await apiClient.post<SanitisingLog>('/api/v1/sanitising-logs', data);
    return response.data;
  },

  update: async (id: number, data: SanitisingLogUpdate): Promise<SanitisingLog> => {
    const response = await apiClient.patch<SanitisingLog>(`/api/v1/sanitising-logs/${id}`, data);
    return response.data;
  },

  lock: async (id: number): Promise<SanitisingLog> => {
    const response = await apiClient.post<SanitisingLog>(`/api/v1/sanitising-logs/${id}/lock`);
    return response.data;
  },

  void: async (id: number, data: VoidRequest): Promise<SanitisingLog> => {
    const response = await apiClient.post<SanitisingLog>(`/api/v1/sanitising-logs/${id}/void`, data);
    return response.data;
  },
};
