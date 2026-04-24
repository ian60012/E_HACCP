import apiClient from './client';
import {
  ProdDailyBatchSheet,
  SaveBatchSheetRequest,
  BatchSheetSummary,
} from '@/types/batch-sheet';
import { PaginatedResponse } from '@/types/common';

export const batchSheetApi = {
  list: async (params?: { skip?: number; limit?: number }): Promise<PaginatedResponse<BatchSheetSummary>> => {
    const res = await apiClient.get<PaginatedResponse<BatchSheetSummary>>('/api/v1/batch-sheets', { params });
    return res.data;
  },

  get: async (batchId: number): Promise<ProdDailyBatchSheet | null> => {
    const res = await apiClient.get<ProdDailyBatchSheet | null>(
      `/api/v1/production/batches/${batchId}/batch-sheet`
    );
    return res.data;
  },

  save: async (batchId: number, data: SaveBatchSheetRequest): Promise<ProdDailyBatchSheet> => {
    const res = await apiClient.post<ProdDailyBatchSheet>(
      `/api/v1/production/batches/${batchId}/batch-sheet`,
      data
    );
    return res.data;
  },

  verify: async (batchId: number): Promise<ProdDailyBatchSheet> => {
    const res = await apiClient.post<ProdDailyBatchSheet>(
      `/api/v1/production/batches/${batchId}/batch-sheet/verify`
    );
    return res.data;
  },
};
