import apiClient from './client';
import { DeviationLog, DeviationLogCreate, DeviationLogUpdate, DeviationCloseRequest } from '@/types/deviation-log';
import { PaginatedResponse, VoidRequest } from '@/types/common';

export const deviationLogsApi = {
  list: async (params?: { skip?: number; limit?: number; is_voided?: boolean; source_log_type?: string; severity?: string; is_open?: boolean }): Promise<PaginatedResponse<DeviationLog>> => {
    const response = await apiClient.get<PaginatedResponse<DeviationLog>>('/api/v1/deviation-logs', { params });
    return response.data;
  },

  get: async (id: number): Promise<DeviationLog> => {
    const response = await apiClient.get<DeviationLog>(`/api/v1/deviation-logs/${id}`);
    return response.data;
  },

  create: async (data: DeviationLogCreate): Promise<DeviationLog> => {
    const response = await apiClient.post<DeviationLog>('/api/v1/deviation-logs', data);
    return response.data;
  },

  update: async (id: number, data: DeviationLogUpdate): Promise<DeviationLog> => {
    const response = await apiClient.patch<DeviationLog>(`/api/v1/deviation-logs/${id}`, data);
    return response.data;
  },

  lock: async (id: number): Promise<DeviationLog> => {
    const response = await apiClient.post<DeviationLog>(`/api/v1/deviation-logs/${id}/lock`);
    return response.data;
  },

  void: async (id: number, data: VoidRequest): Promise<DeviationLog> => {
    const response = await apiClient.post<DeviationLog>(`/api/v1/deviation-logs/${id}/void`, data);
    return response.data;
  },

  close: async (id: number, data: DeviationCloseRequest): Promise<DeviationLog> => {
    const response = await apiClient.post<DeviationLog>(`/api/v1/deviation-logs/${id}/close`, data);
    return response.data;
  },
};
