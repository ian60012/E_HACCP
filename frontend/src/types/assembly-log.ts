import { ALCOAFields } from './common';

export interface AssemblyPackingLog extends ALCOAFields {
  id: number;
  prod_batch_id: number;
  prod_batch_code: string | null;
  is_allergen_declared: boolean;
  is_date_code_correct: boolean | null;
  target_weight_g: string | null;
  sample_1_g: string | null;
  sample_2_g: string | null;
  sample_3_g: string | null;
  sample_4_g: string | null;
  sample_5_g: string | null;
  average_weight_g: string | null;
  seal_integrity: 'Pass' | 'Fail' | null;
  coding_legibility: 'Pass' | 'Fail' | null;
  corrective_action: string | null;
  notes: string | null;
}

export interface AssemblyPackingLogCreate {
  prod_batch_id: number;
  is_allergen_declared: boolean;
  is_date_code_correct?: boolean;
  target_weight_g?: string;
  sample_1_g?: string;
  sample_2_g?: string;
  sample_3_g?: string;
  sample_4_g?: string;
  sample_5_g?: string;
  seal_integrity?: string;
  coding_legibility?: string;
  corrective_action?: string;
  notes?: string;
}

export interface AssemblyPackingLogUpdate {
  is_allergen_declared?: boolean;
  is_date_code_correct?: boolean;
  target_weight_g?: string;
  sample_1_g?: string;
  sample_2_g?: string;
  sample_3_g?: string;
  sample_4_g?: string;
  sample_5_g?: string;
  seal_integrity?: string;
  coding_legibility?: string;
  corrective_action?: string;
  notes?: string;
}
