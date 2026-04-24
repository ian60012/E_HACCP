import apiClient from './client';

export interface ActivityItem {
  module: string;
  record_id: number;
  summary: string | null;
  operator_name: string | null;
  created_at: string;
  is_locked: boolean;
  is_voided: boolean;
}

export interface ActivityResponse {
  items: ActivityItem[];
  total: number;
  skip: number;
  limit: number;
}

export const adminApi = {
  getActivity: async (params?: {
    skip?: number;
    limit?: number;
    operator_name?: string;
    date_from?: string;
    date_to?: string;
    module?: string;
  }): Promise<ActivityResponse> => {
    const res = await apiClient.get<ActivityResponse>('/api/v1/admin/activity', { params });
    return res.data;
  },
};
