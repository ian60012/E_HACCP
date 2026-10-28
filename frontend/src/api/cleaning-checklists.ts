import apiClient from './client';
import { PaginatedResponse, VoidRequest } from '@/types/common';
import {
  CleaningChecklist,
  CleaningChecklistTemplate,
  CleaningChecklistWrite,
  CleaningLineType,
} from '@/types/cleaning-checklist';

export const cleaningChecklistsApi = {
  list: async (params?: {
    skip?: number;
    limit?: number;
    is_voided?: boolean;
    line_type?: CleaningLineType;
    check_date?: string;
  }): Promise<PaginatedResponse<CleaningChecklist>> => {
    const response = await apiClient.get<PaginatedResponse<CleaningChecklist>>('/api/v1/cleaning-checklists', { params });
    return response.data;
  },

  get: async (id: number): Promise<CleaningChecklist> => {
    const response = await apiClient.get<CleaningChecklist>(`/api/v1/cleaning-checklists/${id}`);
    return response.data;
  },

  getTemplate: async (lineType: CleaningLineType): Promise<CleaningChecklistTemplate> => {
    const response = await apiClient.get<CleaningChecklistTemplate>(`/api/v1/cleaning-checklists/template/${lineType}`);
    return response.data;
  },

  create: async (data: CleaningChecklistWrite): Promise<CleaningChecklist> => {
    const response = await apiClient.post<CleaningChecklist>('/api/v1/cleaning-checklists', data);
    return response.data;
  },

  update: async (id: number, data: Partial<CleaningChecklistWrite>): Promise<CleaningChecklist> => {
    const response = await apiClient.patch<CleaningChecklist>(`/api/v1/cleaning-checklists/${id}`, data);
    return response.data;
  },

  lock: async (id: number): Promise<CleaningChecklist> => {
    const response = await apiClient.post<CleaningChecklist>(`/api/v1/cleaning-checklists/${id}/lock`);
    return response.data;
  },

  void: async (id: number, data: VoidRequest): Promise<CleaningChecklist> => {
    const response = await apiClient.post<CleaningChecklist>(`/api/v1/cleaning-checklists/${id}/void`, data);
    return response.data;
  },
};
