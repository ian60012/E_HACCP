import apiClient from './client';
import { AssemblyPackingLog, AssemblyPackingLogCreate, AssemblyPackingLogUpdate } from '@/types/assembly-log';
import { PaginatedResponse, VoidRequest } from '@/types/common';

export const assemblyLogsApi = {
  list: async (params?: { skip?: number; limit?: number; prod_batch_id?: number; is_voided?: boolean }): Promise<PaginatedResponse<AssemblyPackingLog>> => {
    const response = await apiClient.get<PaginatedResponse<AssemblyPackingLog>>('/api/v1/assembly-logs', { params });
    return response.data;
  },

  get: async (id: number): Promise<AssemblyPackingLog> => {
    const response = await apiClient.get<AssemblyPackingLog>(`/api/v1/assembly-logs/${id}`);
    return response.data;
  },

  create: async (data: AssemblyPackingLogCreate): Promise<AssemblyPackingLog> => {
    const response = await apiClient.post<AssemblyPackingLog>('/api/v1/assembly-logs', data);
    return response.data;
  },

  update: async (id: number, data: AssemblyPackingLogUpdate): Promise<AssemblyPackingLog> => {
    const response = await apiClient.patch<AssemblyPackingLog>(`/api/v1/assembly-logs/${id}`, data);
    return response.data;
  },

  lock: async (id: number): Promise<AssemblyPackingLog> => {
    const response = await apiClient.post<AssemblyPackingLog>(`/api/v1/assembly-logs/${id}/lock`);
    return response.data;
  },

  void: async (id: number, data: VoidRequest): Promise<AssemblyPackingLog> => {
    const response = await apiClient.post<AssemblyPackingLog>(`/api/v1/assembly-logs/${id}/void`, data);
    return response.data;
  },
};
