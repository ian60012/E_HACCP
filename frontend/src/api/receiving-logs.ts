import apiClient from './client';
import { ReceivingLog, ReceivingLogCreate, ReceivingLogUpdate } from '@/types/receiving-log';
import { PaginatedResponse, VoidRequest } from '@/types/common';
import { InvStockDoc } from '@/types/inventory';

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

  setInvItem: async (id: number, inv_item_id: number): Promise<ReceivingLog> => {
    const response = await apiClient.patch<ReceivingLog>(`/api/v1/receiving-logs/${id}/inv-item`, null, { params: { inv_item_id } });
    return response.data;
  },

  convertToStockIn: async (id: number, location_id: number): Promise<InvStockDoc> => {
    const response = await apiClient.post<InvStockDoc>(`/api/v1/receiving-logs/${id}/convert-to-stock-in`, { location_id });
    return response.data;
  },
};
