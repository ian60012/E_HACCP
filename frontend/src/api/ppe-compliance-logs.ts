import apiClient from './client';
import { PPEComplianceLog, PPEComplianceLogCreate, PPEComplianceLogUpdate } from '@/types/ppe-compliance-log';
import { PaginatedResponse, VoidRequest } from '@/types/common';

export const ppeComplianceLogsApi = {
  list: async (params?: { skip?: number; limit?: number; is_voided?: boolean; area_id?: number; check_date?: string }): Promise<PaginatedResponse<PPEComplianceLog>> => {
    const response = await apiClient.get<PaginatedResponse<PPEComplianceLog>>('/api/v1/ppe-compliance-logs', { params });
    return response.data;
  },

  get: async (id: number): Promise<PPEComplianceLog> => {
    const response = await apiClient.get<PPEComplianceLog>(`/api/v1/ppe-compliance-logs/${id}`);
    return response.data;
  },

  create: async (data: PPEComplianceLogCreate): Promise<PPEComplianceLog> => {
    const response = await apiClient.post<PPEComplianceLog>('/api/v1/ppe-compliance-logs', data);
    return response.data;
  },

  update: async (id: number, data: PPEComplianceLogUpdate): Promise<PPEComplianceLog> => {
    const response = await apiClient.patch<PPEComplianceLog>(`/api/v1/ppe-compliance-logs/${id}`, data);
    return response.data;
  },

  lock: async (id: number): Promise<PPEComplianceLog> => {
    const response = await apiClient.post<PPEComplianceLog>(`/api/v1/ppe-compliance-logs/${id}/lock`);
    return response.data;
  },

  void: async (id: number, data: VoidRequest): Promise<PPEComplianceLog> => {
    const response = await apiClient.post<PPEComplianceLog>(`/api/v1/ppe-compliance-logs/${id}/void`, data);
    return response.data;
  },
};
