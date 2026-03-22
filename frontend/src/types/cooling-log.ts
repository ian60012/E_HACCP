import { ALCOAFields } from './common';

export interface CoolingLog extends ALCOAFields {
  id: number;
  batch_id: string;
  prod_batch_id: number | null;
  hot_input_id: number | null;
  start_time: string;
  start_temp: string;
  stage1_time: string | null;
  stage1_temp: string | null;
  end_time: string | null;
  end_temp: string | null;
  goes_to_freezer: boolean;
  stage1_duration_minutes: string | null; // generated
  total_duration_minutes: string | null; // generated
  ccp_status: 'Pass' | 'Fail' | 'Deviation' | null;
  corrective_action: string | null;
  notes: string | null;
}

export interface CoolingLogCreate {
  batch_id: string;
  prod_batch_id?: number;
  hot_input_id?: number;
  start_time: string;
  start_temp: string;
  stage1_time?: string;
  stage1_temp?: string;
  end_time?: string;
  end_temp?: string;
  goes_to_freezer?: boolean;
  corrective_action?: string;
  notes?: string;
}

export interface CoolingLogUpdate {
  stage1_time?: string;
  stage1_temp?: string;
  end_time?: string;
  end_temp?: string;
  goes_to_freezer?: boolean;
  corrective_action?: string;
  notes?: string;
}
