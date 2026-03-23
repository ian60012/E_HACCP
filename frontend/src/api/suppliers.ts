import apiClient from './client';
import { Supplier, SupplierCreate, SupplierUpdate } from '@/types/supplier';
import { PaginatedResponse } from '@/types/common';

export const suppliersApi = {
  list: async (skip = 0, limit = 100): Promise<PaginatedResponse<Supplier>> => {
    const response = await apiClient.get<PaginatedResponse<Supplier>>('/api/v1/suppliers', {
      params: { skip, limit },
    });
    return response.data;
  },

  get: async (id: number): Promise<Supplier> => {
    const response = await apiClient.get<Supplier>(`/api/v1/suppliers/${id}`);
    return response.data;
  },

  create: async (data: SupplierCreate): Promise<Supplier> => {
    const response = await apiClient.post<Supplier>('/api/v1/suppliers', data);
    return response.data;
  },

  update: async (id: number, data: SupplierUpdate): Promise<Supplier> => {
    const response = await apiClient.patch<Supplier>(`/api/v1/suppliers/${id}`, data);
    return response.data;
  },

  downloadTemplate: async (): Promise<Blob> => {
    const res = await apiClient.get('/api/v1/suppliers/template', { responseType: 'blob' });
    return res.data;
  },

  importSuppliers: async (file: File): Promise<{ created: number; skipped: number; errors: { row: number; code: string; message: string }[] }> => {
    const form = new FormData();
    form.append('file', file);
    const res = await apiClient.post('/api/v1/suppliers/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
};
