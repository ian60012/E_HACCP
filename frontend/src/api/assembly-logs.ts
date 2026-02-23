import apiClient from './client';
import { AssemblyLog, AssemblyLogCreate, AssemblyLogUpdate } from '@/types/assembly-log';
import { PaginatedResponse, VoidRequest } from '@/types/common';

export const assemblyLogsApi = {
  list: async (params?: { skip?: number; limit?: number; is_voided?: boolean }): Promise<PaginatedResponse<AssemblyLog>> => {
    const response = await apiClient.get<PaginatedResponse<AssemblyLog>>('/api/v1/assembly-packing-logs', { params });
    return response.data;
  },

  get: async (id: number): Promise<AssemblyLog> => {
    const response = await apiClient.get<AssemblyLog>(`/api/v1/assembly-packing-logs/${id}`);
    return response.data;
  },

  create: async (data: AssemblyLogCreate): Promise<AssemblyLog> => {
    const response = await apiClient.post<AssemblyLog>('/api/v1/assembly-packing-logs', data);
    return response.data;
  },

  update: async (id: number, data: AssemblyLogUpdate): Promise<AssemblyLog> => {
    const response = await apiClient.patch<AssemblyLog>(`/api/v1/assembly-packing-logs/${id}`, data);
    return response.data;
  },

  lock: async (id: number): Promise<AssemblyLog> => {
    const response = await apiClient.post<AssemblyLog>(`/api/v1/assembly-packing-logs/${id}/lock`);
    return response.data;
  },

  void: async (id: number, data: VoidRequest): Promise<AssemblyLog> => {
    const response = await apiClient.post<AssemblyLog>(`/api/v1/assembly-packing-logs/${id}/void`, data);
    return response.data;
  },
};
