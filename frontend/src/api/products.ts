import apiClient from './client';
import { Product, ProductCreate, ProductUpdate } from '@/types/product';
import { PaginatedResponse } from '@/types/common';

export const productsApi = {
  list: async (skip = 0, limit = 100): Promise<PaginatedResponse<Product>> => {
    const response = await apiClient.get<PaginatedResponse<Product>>('/api/v1/products', {
      params: { skip, limit },
    });
    return response.data;
  },

  get: async (id: number): Promise<Product> => {
    const response = await apiClient.get<Product>(`/api/v1/products/${id}`);
    return response.data;
  },

  create: async (data: ProductCreate): Promise<Product> => {
    const response = await apiClient.post<Product>('/api/v1/products', data);
    return response.data;
  },

  update: async (id: number, data: ProductUpdate): Promise<Product> => {
    const response = await apiClient.patch<Product>(`/api/v1/products/${id}`, data);
    return response.data;
  },
};
