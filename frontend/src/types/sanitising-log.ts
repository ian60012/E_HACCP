import { ALCOAFields } from './common';

export interface SanitisingLog extends ALCOAFields {
  id: number;
  area_id: number;
  area_name: string | null;
  target_description: string;
  chemical: 'Buff' | 'Hybrid' | 'Command' | 'Keyts' | 'Chlorine';
  dilution_ratio: string | null;
  atp_result_rlu: number | null;
  atp_status: 'Pass' | 'Fail' | null;
  corrective_action: string | null;
  notes: string | null;
}

export interface SanitisingLogCreate {
  area_id: number;
  target_description: string;
  chemical: 'Buff' | 'Hybrid' | 'Command' | 'Keyts' | 'Chlorine';
  dilution_ratio?: string;
  atp_result_rlu?: number;
  atp_status?: 'Pass' | 'Fail';
  corrective_action?: string;
  notes?: string;
}

export interface SanitisingLogUpdate {
  atp_result_rlu?: number;
  atp_status?: 'Pass' | 'Fail';
  corrective_action?: string;
  notes?: string;
}
