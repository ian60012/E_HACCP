import apiClient from './client';
import { Area, AreaCreate, AreaUpdate } from '@/types/area';
import { PaginatedResponse } from '@/types/common';

export const areasApi = {
  list: async (skip = 0, limit = 100): Promise<PaginatedResponse<Area>> => {
    const response = await apiClient.get<PaginatedResponse<Area>>('/api/v1/areas', {
      params: { skip, limit },
    });
    return response.data;
  },

  get: async (id: number): Promise<Area> => {
    const response = await apiClient.get<Area>(`/api/v1/areas/${id}`);
    return response.data;
  },

  create: async (data: AreaCreate): Promise<Area> => {
    const response = await apiClient.post<Area>('/api/v1/areas', data);
    return response.data;
  },

  update: async (id: number, data: AreaUpdate): Promise<Area> => {
    const response = await apiClient.patch<Area>(`/api/v1/areas/${id}`, data);
    return response.data;
  },
};
