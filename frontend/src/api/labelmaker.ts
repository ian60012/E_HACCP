import apiClient from './client';
import type { ProductTemplate } from '@/features/labelmaker/types';

export interface LabelTemplate {
  id: number;
  prod_product_id: number;
  pack_type_code: string;
  product_name_zh: string;
  product_name_en: string;
  net_weight_g: string;
  serving_size_g: string;
  servings_per_package: string;
  storage_conditions: string;
  customer_text: string;
  shelf_life_days: number;
  nutrition_per_100g: ProductTemplate['nutritionPer100g'];
  ingredients: ProductTemplate['ingredients'];
  recipe: ProductTemplate['recipe'] | null;
  allergens_confirmed_at: string | null;
  product_code: string | null;
  product_name: string | null;
  pack_type_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface LabelTemplatePayload {
  prod_product_id: number;
  pack_type_code: string;
  product_name_zh: string;
  product_name_en: string;
  net_weight_g: number;
  serving_size_g: number;
  servings_per_package: number;
  storage_conditions: string;
  customer_text: string;
  shelf_life_days: number;
  nutrition_per_100g: ProductTemplate['nutritionPer100g'];
  ingredients: ProductTemplate['ingredients'];
  recipe?: ProductTemplate['recipe'] | null;
  allergens_confirmed_at?: string | null;
}

export const labelmakerApi = {
  listTemplates: async (params?: { prod_product_id?: number; pack_type_code?: string }): Promise<LabelTemplate[]> => {
    const res = await apiClient.get<LabelTemplate[]>('/api/v1/labelmaker/templates', { params });
    return res.data;
  },
  getTemplateByProductPack: async (prodProductId: number, packTypeCode: string): Promise<LabelTemplate> => {
    const res = await apiClient.get<LabelTemplate>('/api/v1/labelmaker/templates/by-product-pack', {
      params: { prod_product_id: prodProductId, pack_type_code: packTypeCode },
    });
    return res.data;
  },
  createTemplate: async (data: LabelTemplatePayload): Promise<LabelTemplate> => {
    const res = await apiClient.post<LabelTemplate>('/api/v1/labelmaker/templates', data);
    return res.data;
  },
  updateTemplate: async (id: number, data: Partial<LabelTemplatePayload>): Promise<LabelTemplate> => {
    const res = await apiClient.patch<LabelTemplate>(`/api/v1/labelmaker/templates/${id}`, data);
    return res.data;
  },
  deleteTemplate: async (id: number): Promise<void> => {
    await apiClient.delete(`/api/v1/labelmaker/templates/${id}`);
  },
  renderPdf: async (data: {
    template_id?: number;
    prod_product_id?: number;
    pack_type_code?: string;
    production_date?: string;
    expiry_date?: string;
  }): Promise<Blob> => {
    const res = await apiClient.post('/api/v1/labelmaker/render-pdf', data, { responseType: 'blob', timeout: 60000 });
    return res.data;
  },
};
