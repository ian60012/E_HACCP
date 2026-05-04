import apiClient from './client';

const BASE = '/api/v1/production-helper';

export interface PHProduct {
  id: number;
  code: string;
  name: string;
  product_type: string | null;
  ccp_limit_temp: number | null;
  is_active: boolean;
}

export interface PHBatch {
  id: number;
  batch_code: string;
  product_code: string;
  product_name: string;
  production_date: string | null;
  shift: string | null;
}

export interface PHInventoryItem {
  id: number;
  code: string;
  name: string;
  category: string | null;
  base_unit: string;
  usage_unit: string | null;
  is_active: boolean;
}

export interface PHPlanItem {
  id: string;
  type: 'plan' | 'note';
  week: string;
  date: string;
  day: string;
  station: string;
  updated_at?: string;
  created_at?: string;
  // plan fields
  product_id?: number | string | null;
  product_code?: string;
  product_name?: string;
  main_material_name?: string;
  main_material_qty_kg?: string | number;
  notes?: string;
  // note fields
  title?: string;
  content?: string;
}

export interface PHRecipeAux {
  item_id: number | string | null;
  item_code: string;
  item_name: string;
  unit: string;
  qty_per_kg_main_material: string | number;
}

export interface PHRecipe {
  id: string;
  product_id: number | string | null;
  product_code: string;
  product_name: string;
  main_material_name: string;
  auxiliaries: PHRecipeAux[];
  updated_at?: string;
}

export interface PHRequirement {
  required_date: string;
  due_date: string;
  item_id: number | string | null;
  item_code: string;
  item_name: string;
  unit: string;
  total_qty: number;
  material_type: 'main' | 'aux';
  source_products: Array<{
    date: string;
    product_code: string;
    product_name: string;
    main_material_qty_kg: number;
  }>;
}

export interface PHBootstrap {
  products: { items: PHProduct[]; total: number; synced_at: string };
  recent_batches: { items: PHBatch[]; total: number; synced_at: string };
  inventory_items: { items: PHInventoryItem[]; total: number; synced_at: string };
  plans: { items: PHPlanItem[] };
  recipes: { recipes: PHRecipe[] };
  purchase_status: { ordered_keys: string[] };
  config: Record<string, unknown>;
}

export const phApi = {
  bootstrap: async (): Promise<PHBootstrap> => {
    const res = await apiClient.get<PHBootstrap>(`${BASE}/bootstrap`);
    return res.data;
  },

  // plans (and notes — same endpoint, distinguished by `type` field)
  createPlan: async (body: Partial<PHPlanItem>): Promise<PHPlanItem> => {
    const res = await apiClient.post<PHPlanItem>(`${BASE}/plans`, body);
    return res.data;
  },
  updatePlan: async (id: string, body: Partial<PHPlanItem>): Promise<PHPlanItem> => {
    const res = await apiClient.put<PHPlanItem>(`${BASE}/plans/${id}`, body);
    return res.data;
  },
  deletePlan: async (id: string): Promise<{ deleted: number }> => {
    const res = await apiClient.delete<{ deleted: number }>(`${BASE}/plans/${id}`);
    return res.data;
  },

  // recipes
  createRecipe: async (body: Partial<PHRecipe>): Promise<PHRecipe> => {
    const res = await apiClient.post<PHRecipe>(`${BASE}/recipes`, body);
    return res.data;
  },
  updateRecipe: async (id: string, body: Partial<PHRecipe>): Promise<PHRecipe> => {
    const res = await apiClient.put<PHRecipe>(`${BASE}/recipes/${id}`, body);
    return res.data;
  },
  deleteRecipe: async (id: string): Promise<{ deleted: number }> => {
    const res = await apiClient.delete<{ deleted: number }>(`${BASE}/recipes/${id}`);
    return res.data;
  },

  // purchase status
  setPurchaseStatus: async (key: string, ordered: boolean): Promise<{ ordered_keys: string[] }> => {
    const res = await apiClient.post<{ ordered_keys: string[] }>(`${BASE}/purchase-status`, { key, ordered });
    return res.data;
  },

  // requirements
  getRequirements: async (week?: string): Promise<{ items: PHRequirement[] }> => {
    const res = await apiClient.get<{ items: PHRequirement[] }>(`${BASE}/purchase-requirements`, {
      params: week ? { week } : undefined,
    });
    return res.data;
  },

  downloadCsv: async (week?: string): Promise<void> => {
    const res = await apiClient.get(`${BASE}/purchase-requirements.csv`, {
      params: week ? { week } : undefined,
      responseType: 'blob',
    });
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `purchase-${week ?? 'week'}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
