import apiClient from './client';
import { ProdDailyBatchSheet, SaveBatchSheetRequest } from '@/types/batch-sheet';

export const batchSheetApi = {
  get: async (batchId: number): Promise<ProdDailyBatchSheet> => {
    const res = await apiClient.get<ProdDailyBatchSheet>(
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
