import apiClient from './client';
import {
  InvItem, InvItemCreate, InvItemUpdate,
  InvLocation, InvLocationCreate, InvLocationUpdate,
  InvStockDoc, InvStockDocCreate,
  InvStockBalance, InvStockMovement,
  InvStocktake, InvStocktakeCreate, InvStocktakeLineUpdate, InvStocktakeLine,
} from '@/types/inventory';
import { PaginatedResponse } from '@/types/common';

// ─── Items ─────────────────────────────────────────────────────────────────

export const invItemsApi = {
  list: async (params?: {
    skip?: number; limit?: number; search?: string; is_active?: boolean;
  }): Promise<PaginatedResponse<InvItem>> => {
    const res = await apiClient.get<PaginatedResponse<InvItem>>('/api/v1/inventory/items', { params });
    return res.data;
  },

  get: async (id: number): Promise<InvItem> => {
    const res = await apiClient.get<InvItem>(`/api/v1/inventory/items/${id}`);
    return res.data;
  },

  create: async (data: InvItemCreate): Promise<InvItem> => {
    const res = await apiClient.post<InvItem>('/api/v1/inventory/items', data);
    return res.data;
  },

  update: async (id: number, data: InvItemUpdate): Promise<InvItem> => {
    const res = await apiClient.patch<InvItem>(`/api/v1/inventory/items/${id}`, data);
    return res.data;
  },

  setAllowedLocations: async (id: number, location_ids: number[]): Promise<InvItem> => {
    const res = await apiClient.put<InvItem>(`/api/v1/inventory/items/${id}/allowed-locations`, { location_ids });
    return res.data;
  },
  downloadTemplate: async (): Promise<Blob> => {
    const res = await apiClient.get('/api/v1/inventory/items/template', { responseType: 'blob' });
    return res.data;
  },
  importItems: async (file: File): Promise<{ created: number; skipped: number; errors: { row: number; code: string; message: string }[] }> => {
    const form = new FormData();
    form.append('file', file);
    const res = await apiClient.post('/api/v1/inventory/items/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
};

// ─── Locations ─────────────────────────────────────────────────────────────

export const invLocationsApi = {
  list: async (params?: {
    skip?: number; limit?: number; is_active?: boolean;
  }): Promise<PaginatedResponse<InvLocation>> => {
    const res = await apiClient.get<PaginatedResponse<InvLocation>>('/api/v1/inventory/locations', { params });
    return res.data;
  },

  get: async (id: number): Promise<InvLocation> => {
    const res = await apiClient.get<InvLocation>(`/api/v1/inventory/locations/${id}`);
    return res.data;
  },

  create: async (data: InvLocationCreate): Promise<InvLocation> => {
    const res = await apiClient.post<InvLocation>('/api/v1/inventory/locations', data);
    return res.data;
  },

  update: async (id: number, data: InvLocationUpdate): Promise<InvLocation> => {
    const res = await apiClient.patch<InvLocation>(`/api/v1/inventory/locations/${id}`, data);
    return res.data;
  },
};

// ─── Documents ─────────────────────────────────────────────────────────────

export const invDocsApi = {
  list: async (params?: {
    skip?: number; limit?: number; doc_type?: string; status?: string;
  }): Promise<PaginatedResponse<InvStockDoc>> => {
    const res = await apiClient.get<PaginatedResponse<InvStockDoc>>('/api/v1/inventory/docs', { params });
    return res.data;
  },

  get: async (id: number): Promise<InvStockDoc> => {
    const res = await apiClient.get<InvStockDoc>(`/api/v1/inventory/docs/${id}`);
    return res.data;
  },

  create: async (data: InvStockDocCreate): Promise<InvStockDoc> => {
    const res = await apiClient.post<InvStockDoc>('/api/v1/inventory/docs', data);
    return res.data;
  },

  update: async (id: number, data: { ref_number?: string; notes?: string; lines: import('@/types/inventory').InvStockLineCreate[] }): Promise<InvStockDoc> => {
    const res = await apiClient.patch<InvStockDoc>(`/api/v1/inventory/docs/${id}`, data);
    return res.data;
  },

  post: async (id: number): Promise<InvStockDoc> => {
    const res = await apiClient.post<InvStockDoc>(`/api/v1/inventory/docs/${id}/post`);
    return res.data;
  },

  void: async (id: number, void_reason: string): Promise<InvStockDoc> => {
    const res = await apiClient.post<InvStockDoc>(`/api/v1/inventory/docs/${id}/void`, { void_reason });
    return res.data;
  },
};

// ─── Balance ───────────────────────────────────────────────────────────────

export const invBalanceApi = {
  list: async (params?: {
    skip?: number; limit?: number; item_id?: number; location_id?: number;
  }): Promise<PaginatedResponse<InvStockBalance>> => {
    const res = await apiClient.get<PaginatedResponse<InvStockBalance>>('/api/v1/inventory/balance', { params });
    return res.data;
  },

  listByLocation: async (params?: {
    location_id?: number;
  }): Promise<PaginatedResponse<InvStockBalance>> => {
    const res = await apiClient.get<PaginatedResponse<InvStockBalance>>('/api/v1/inventory/balance/by-location', { params });
    return res.data;
  },

  movements: async (params?: {
    skip?: number; limit?: number; item_id?: number; location_id?: number; doc_id?: number;
  }): Promise<PaginatedResponse<InvStockMovement>> => {
    const res = await apiClient.get<PaginatedResponse<InvStockMovement>>('/api/v1/inventory/balance/movements', { params });
    return res.data;
  },
};

// ─── Stocktake (盤點) ──────────────────────────────────────────────────────

export const invStocktakeApi = {
  list: async (params?: {
    skip?: number; limit?: number; status?: string; location_id?: number;
  }): Promise<PaginatedResponse<InvStocktake>> => {
    const res = await apiClient.get<PaginatedResponse<InvStocktake>>('/api/v1/inventory/stocktakes', { params });
    return res.data;
  },

  create: async (data: InvStocktakeCreate): Promise<InvStocktake> => {
    const res = await apiClient.post<InvStocktake>('/api/v1/inventory/stocktakes', data);
    return res.data;
  },

  get: async (id: number): Promise<InvStocktake> => {
    const res = await apiClient.get<InvStocktake>(`/api/v1/inventory/stocktakes/${id}`);
    return res.data;
  },

  updateLine: async (id: number, lineId: number, data: InvStocktakeLineUpdate): Promise<InvStocktakeLine> => {
    const res = await apiClient.patch<InvStocktakeLine>(`/api/v1/inventory/stocktakes/${id}/lines/${lineId}`, data);
    return res.data;
  },

  confirm: async (id: number): Promise<InvStocktake> => {
    const res = await apiClient.post<InvStocktake>(`/api/v1/inventory/stocktakes/${id}/confirm`);
    return res.data;
  },
};

// ─── Receiving log → stock-IN conversion ───────────────────────────────────

export const receivingLogInvApi = {
  setItem: async (logId: number, inv_item_id: number) => {
    const res = await apiClient.patch(`/api/v1/receiving-logs/${logId}/inv-item`, null, {
      params: { inv_item_id },
    });
    return res.data;
  },

  convertToStockIn: async (logId: number, location_id: number): Promise<InvStockDoc> => {
    const res = await apiClient.post<InvStockDoc>(
      `/api/v1/receiving-logs/${logId}/convert-to-stock-in`,
      { location_id }
    );
    return res.data;
  },
};
