import apiClient from './client';
import { TokenResponse, User } from '@/types/auth';

export const authApi = {
  login: async (username: string, password: string): Promise<TokenResponse> => {
    // OAuth2 requires form-data, not JSON
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);

    const response = await apiClient.post<TokenResponse>('/api/v1/auth/login', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return response.data;
  },

  getMe: async (): Promise<User> => {
    const response = await apiClient.get<User>('/api/v1/auth/me');
    return response.data;
  },
};
