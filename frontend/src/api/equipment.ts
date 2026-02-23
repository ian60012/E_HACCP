import apiClient from './client';
import { Equipment, EquipmentCreate, EquipmentUpdate } from '@/types/equipment';
import { PaginatedResponse } from '@/types/common';

export const equipmentApi = {
  list: async (skip = 0, limit = 100): Promise<PaginatedResponse<Equipment>> => {
    const response = await apiClient.get<PaginatedResponse<Equipment>>('/api/v1/equipment', {
      params: { skip, limit },
    });
    return response.data;
  },

  get: async (id: number): Promise<Equipment> => {
    const response = await apiClient.get<Equipment>(`/api/v1/equipment/${id}`);
    return response.data;
  },

  create: async (data: EquipmentCreate): Promise<Equipment> => {
    const response = await apiClient.post<Equipment>('/api/v1/equipment', data);
    return response.data;
  },

  update: async (id: number, data: EquipmentUpdate): Promise<Equipment> => {
    const response = await apiClient.patch<Equipment>(`/api/v1/equipment/${id}`, data);
    return response.data;
  },
};
