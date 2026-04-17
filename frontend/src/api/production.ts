import apiClient from './client';
import {
  ProdProduct, ProdProductCreate, ProdProductUpdate,
  ProdBatch, ProdBatchCreate, ProdBatchUpdate,
  ProdFormingTrolley, ProdFormingTrolleyCreate,
  ProdPackingSaveRequest,
  ProdHotInput, ProdHotInputCreate,
  ProdRepackJob, ProdRepackJobCreate,
  ProdRepackInput, ProdRepackInputCreate,
  ProdRepackOutput, ProdRepackOutputCreate,
  ProdRepackTrim, ProdRepackTrimCreate,
  FormingOption, FormingTotals, PackingTotals, RepackTotals, HotProcessBalance,
  PackTypeConfig, PackTypeConfigCreate, PackTypeConfigUpdate,
} from '@/types/production';
import { PaginatedResponse } from '@/types/common';

// ─── Products ───────────────────────────────────────────────────────────────

export const prodProductsApi = {
  list: async (params?: {
    skip?: number; limit?: number; search?: string; show_inactive?: boolean;
  }): Promise<PaginatedResponse<ProdProduct>> => {
    const res = await apiClient.get<PaginatedResponse<ProdProduct>>('/api/v1/production/products', { params });
    return res.data;
  },
  get: async (id: number): Promise<ProdProduct> => {
    const res = await apiClient.get<ProdProduct>(`/api/v1/production/products/${id}`);
    return res.data;
  },
  create: async (data: ProdProductCreate): Promise<ProdProduct> => {
    const res = await apiClient.post<ProdProduct>('/api/v1/production/products', data);
    return res.data;
  },
  update: async (id: number, data: ProdProductUpdate): Promise<ProdProduct> => {
    const res = await apiClient.patch<ProdProduct>(`/api/v1/production/products/${id}`, data);
    return res.data;
  },
  formingOptions: async (): Promise<FormingOption[]> => {
    const res = await apiClient.get<FormingOption[]>('/api/v1/production/products/forming-options');
    return res.data;
  },
  downloadTemplate: async (): Promise<Blob> => {
    const res = await apiClient.get('/api/v1/production/products/template', { responseType: 'blob' });
    return res.data;
  },
  importProducts: async (file: File): Promise<{ created: number; skipped: number; errors: { row: number; code: string; message: string }[] }> => {
    const form = new FormData();
    form.append('file', file);
    const res = await apiClient.post('/api/v1/production/products/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
};

// ─── Batches ────────────────────────────────────────────────────────────────

export const prodBatchesApi = {
  list: async (params?: {
    skip?: number; limit?: number; status?: string; date_from?: string; date_to?: string; product_type?: string; product_code?: string; include_voided?: boolean;
  }): Promise<PaginatedResponse<ProdBatch>> => {
    const res = await apiClient.get<PaginatedResponse<ProdBatch>>('/api/v1/production/batches', { params });
    return res.data;
  },
  get: async (id: number): Promise<ProdBatch> => {
    const res = await apiClient.get<ProdBatch>(`/api/v1/production/batches/${id}`);
    return res.data;
  },
  create: async (data: ProdBatchCreate): Promise<ProdBatch> => {
    const res = await apiClient.post<ProdBatch>('/api/v1/production/batches', data);
    return res.data;
  },
  update: async (id: number, data: ProdBatchUpdate): Promise<ProdBatch> => {
    const res = await apiClient.patch<ProdBatch>(`/api/v1/production/batches/${id}`, data);
    return res.data;
  },
  addTrolley: async (batchId: number, data: ProdFormingTrolleyCreate): Promise<ProdFormingTrolley> => {
    const res = await apiClient.post<ProdFormingTrolley>(`/api/v1/production/batches/${batchId}/trolleys`, data);
    return res.data;
  },
  removeTrolley: async (batchId: number, trolleyId: number): Promise<void> => {
    await apiClient.delete(`/api/v1/production/batches/${batchId}/trolleys/${trolleyId}`);
  },
  getFormingTotals: async (batchId: number): Promise<FormingTotals> => {
    const res = await apiClient.get<FormingTotals>(`/api/v1/production/batches/${batchId}/forming-totals`);
    return res.data;
  },
  savePacking: async (batchId: number, data: ProdPackingSaveRequest): Promise<ProdBatch> => {
    const res = await apiClient.post<ProdBatch>(`/api/v1/production/batches/${batchId}/packing`, data);
    return res.data;
  },
  getPackingTotals: async (batchId: number): Promise<PackingTotals> => {
    const res = await apiClient.get<PackingTotals>(`/api/v1/production/batches/${batchId}/packing-totals`);
    return res.data;
  },
  getHotProcessBalance: async (batchId: number): Promise<HotProcessBalance> => {
    const res = await apiClient.get<HotProcessBalance>(`/api/v1/production/batches/${batchId}/hot-process-balance`);
    return res.data;
  },
  enterStock: async (batchId: number, locationId: number): Promise<ProdBatch> => {
    const res = await apiClient.post<ProdBatch>(`/api/v1/production/batches/${batchId}/enter-stock`, { location_id: locationId });
    return res.data;
  },
  addHotInput: async (batchId: number, data: ProdHotInputCreate): Promise<ProdBatch> => {
    const res = await apiClient.post<ProdBatch>(`/api/v1/production/batches/${batchId}/hot-inputs`, data);
    return res.data;
  },
  removeHotInput: async (batchId: number, inputId: number): Promise<void> => {
    await apiClient.delete(`/api/v1/production/batches/${batchId}/hot-inputs/${inputId}`);
  },
  void: async (batchId: number, voidReason: string): Promise<ProdBatch> => {
    const res = await apiClient.post<ProdBatch>(`/api/v1/production/batches/${batchId}/void`, { void_reason: voidReason });
    return res.data;
  },
};

// ─── Pack Types ─────────────────────────────────────────────────────────────

export const packTypesApi = {
  list: async (params?: { applicable_type?: string; show_inactive?: boolean }): Promise<PackTypeConfig[]> => {
    const res = await apiClient.get<PackTypeConfig[]>('/api/v1/production/pack-types', { params });
    return res.data;
  },
  create: async (data: PackTypeConfigCreate): Promise<PackTypeConfig> => {
    const res = await apiClient.post<PackTypeConfig>('/api/v1/production/pack-types', data);
    return res.data;
  },
  update: async (id: number, data: PackTypeConfigUpdate): Promise<PackTypeConfig> => {
    const res = await apiClient.patch<PackTypeConfig>(`/api/v1/production/pack-types/${id}`, data);
    return res.data;
  },
};

// ─── Repack ─────────────────────────────────────────────────────────────────

export const prodRepackApi = {
  list: async (params?: {
    skip?: number; limit?: number; date_from?: string; date_to?: string;
  }): Promise<PaginatedResponse<ProdRepackJob>> => {
    const res = await apiClient.get<PaginatedResponse<ProdRepackJob>>('/api/v1/production/repack', { params });
    return res.data;
  },
  get: async (id: number): Promise<ProdRepackJob> => {
    const res = await apiClient.get<ProdRepackJob>(`/api/v1/production/repack/${id}`);
    return res.data;
  },
  create: async (data: ProdRepackJobCreate): Promise<ProdRepackJob> => {
    const res = await apiClient.post<ProdRepackJob>('/api/v1/production/repack', data);
    return res.data;
  },
  addInput: async (jobId: number, data: ProdRepackInputCreate): Promise<ProdRepackInput> => {
    const res = await apiClient.post<ProdRepackInput>(`/api/v1/production/repack/${jobId}/inputs`, data);
    return res.data;
  },
  removeInput: async (jobId: number, inputId: number): Promise<void> => {
    await apiClient.delete(`/api/v1/production/repack/${jobId}/inputs/${inputId}`);
  },
  addOutput: async (jobId: number, data: ProdRepackOutputCreate): Promise<ProdRepackOutput> => {
    const res = await apiClient.post<ProdRepackOutput>(`/api/v1/production/repack/${jobId}/outputs`, data);
    return res.data;
  },
  removeOutput: async (jobId: number, outputId: number): Promise<void> => {
    await apiClient.delete(`/api/v1/production/repack/${jobId}/outputs/${outputId}`);
  },
  addTrim: async (jobId: number, data: ProdRepackTrimCreate): Promise<ProdRepackTrim> => {
    const res = await apiClient.post<ProdRepackTrim>(`/api/v1/production/repack/${jobId}/trims`, data);
    return res.data;
  },
  removeTrim: async (jobId: number, trimId: number): Promise<void> => {
    await apiClient.delete(`/api/v1/production/repack/${jobId}/trims/${trimId}`);
  },
  getTotals: async (jobId: number): Promise<RepackTotals> => {
    const res = await apiClient.get<RepackTotals>(`/api/v1/production/repack/${jobId}/totals`);
    return res.data;
  },
};
