import { ALCOAFields } from './common';

export interface MixingLog extends ALCOAFields {
  id: number;
  batch_id: string;
  prod_batch_id: number | null;
  prod_product_id: number | null;
  product_name: string | null;
  product_code: string | null;
  weight_kg: number | null;
  initial_temp: number | null;
  final_temp: number | null;
  start_time: string;
  end_time: string | null;
  visual_check: boolean;
  corrective_action: string | null;
  notes: string | null;
}

export interface MixingLogCreate {
  batch_id: string;
  prod_product_id?: number;
  prod_batch_id?: number;
  weight_kg?: number;
  initial_temp?: number;
  final_temp?: number;
  start_time: string;
  end_time?: string;
  visual_check?: boolean;
  corrective_action?: string;
  notes?: string;
}

export interface MixingLogUpdate {
  weight_kg?: number;
  initial_temp?: number;
  final_temp?: number;
  end_time?: string;
  visual_check?: boolean;
  corrective_action?: string;
  notes?: string;
}
