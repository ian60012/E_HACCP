import { ALCOAFields } from './common';

export interface AssemblyLog extends ALCOAFields {
  id: number;
  batch_id: string;
  product_id: number;
  product_name: string | null;
  is_allergen_declared: boolean;
  is_date_code_correct: boolean | null;
  label_photo_path: string | null;
  target_weight_g: string | null;
  sample_1_g: string | null;
  sample_2_g: string | null;
  sample_3_g: string | null;
  sample_4_g: string | null;
  sample_5_g: string | null;
  average_weight_g: string | null; // generated
  seal_integrity: 'Pass' | 'Fail' | null;
  coding_legibility: 'Pass' | 'Fail' | null;
  corrective_action: string | null;
  notes: string | null;
  warnings: string[];
}

export interface AssemblyLogCreate {
  batch_id: string;
  product_id: number;
  is_allergen_declared: boolean;
  is_date_code_correct?: boolean;
  label_photo_path?: string;
  target_weight_g?: string;
  sample_1_g?: string;
  sample_2_g?: string;
  sample_3_g?: string;
  sample_4_g?: string;
  sample_5_g?: string;
  seal_integrity?: 'Pass' | 'Fail';
  coding_legibility?: 'Pass' | 'Fail';
  corrective_action?: string;
  notes?: string;
}

export interface AssemblyLogUpdate {
  is_allergen_declared?: boolean;
  is_date_code_correct?: boolean;
  label_photo_path?: string;
  target_weight_g?: string;
  sample_1_g?: string;
  sample_2_g?: string;
  sample_3_g?: string;
  sample_4_g?: string;
  sample_5_g?: string;
  seal_integrity?: 'Pass' | 'Fail';
  coding_legibility?: 'Pass' | 'Fail';
  corrective_action?: string;
  notes?: string;
}
