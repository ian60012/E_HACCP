import { ALCOAFields } from './common';

export interface CookingLog extends ALCOAFields {
  id: number;
  batch_id: string;
  prod_batch_id: number | null;
  product_id: number;
  product_name: string | null;
  equipment_id: number | null;
  equipment_name: string | null;
  start_time: string;
  end_time: string | null;
  core_temp: string | null; // Decimal
  ccp_status: 'Pass' | 'Fail' | 'Deviation' | null;
  corrective_action: string | null;
  notes: string | null;
}

export interface CookingLogCreate {
  batch_id: string;
  prod_batch_id?: number;
  product_id: number;
  equipment_id?: number;
  start_time: string;
  end_time?: string;
  core_temp?: string;
  corrective_action?: string;
  notes?: string;
}

export interface CookingLogUpdate {
  prod_batch_id?: number;
  end_time?: string;
  core_temp?: string;
  corrective_action?: string;
  notes?: string;
}
