import apiClient from './client';
import { ReceivingLog, ReceivingLogCreate, ReceivingLogUpdate } from '@/types/receiving-log';
import { PaginatedResponse, VoidRequest } from '@/types/common';

export const receivingLogsApi = {
  list: async (params?: { skip?: number; limit?: number; is_voided?: boolean }): Promise<PaginatedResponse<ReceivingLog>> => {
    const response = await apiClient.get<PaginatedResponse<ReceivingLog>>('/api/v1/receiving-logs', { params });
    return response.data;
  },

  get: async (id: number): Promise<ReceivingLog> => {
    const response = await apiClient.get<ReceivingLog>(`/api/v1/receiving-logs/${id}`);
    return response.data;
  },

  create: async (data: ReceivingLogCreate): Promise<ReceivingLog> => {
    const response = await apiClient.post<ReceivingLog>('/api/v1/receiving-logs', data);
    return response.data;
  },

  update: async (id: number, data: ReceivingLogUpdate): Promise<ReceivingLog> => {
    const response = await apiClient.patch<ReceivingLog>(`/api/v1/receiving-logs/${id}`, data);
    return response.data;
  },

  lock: async (id: number): Promise<ReceivingLog> => {
    const response = await apiClient.post<ReceivingLog>(`/api/v1/receiving-logs/${id}/lock`);
    return response.data;
  },

  void: async (id: number, data: VoidRequest): Promise<ReceivingLog> => {
    const response = await apiClient.post<ReceivingLog>(`/api/v1/receiving-logs/${id}/void`, data);
    return response.data;
  },
};
