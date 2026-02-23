import apiClient from './client';
import { User, UserCreate, UserUpdate } from '@/types/auth';
import { PaginatedResponse } from '@/types/common';

export const usersApi = {
  list: async (skip = 0, limit = 100): Promise<PaginatedResponse<User>> => {
    const response = await apiClient.get<PaginatedResponse<User>>('/api/v1/users', {
      params: { skip, limit },
    });
    return response.data;
  },

  get: async (id: number): Promise<User> => {
    const response = await apiClient.get<User>(`/api/v1/users/${id}`);
    return response.data;
  },

  create: async (data: UserCreate): Promise<User> => {
    const response = await apiClient.post<User>('/api/v1/users', data);
    return response.data;
  },

  update: async (id: number, data: UserUpdate): Promise<User> => {
    const response = await apiClient.patch<User>(`/api/v1/users/${id}`, data);
    return response.data;
  },

  resetPassword: async (id: number, newPassword: string): Promise<void> => {
    await apiClient.post(`/api/v1/users/${id}/reset-password`, { new_password: newPassword });
  },
};
