import { ALCOAFields } from './common';

export type PassFail = 'Pass' | 'Fail';

export interface PPEComplianceLog extends ALCOAFields {
  id: number;
  check_date: string;
  area_id: number;
  area_name: string | null;
  staff_count: number;

  hair_net: PassFail;
  beard_net: PassFail;
  clean_uniform: PassFail;
  no_nail_polish: PassFail;
  safety_shoes: PassFail;
  single_use_mask: PassFail;
  no_jewellery: PassFail;
  hand_hygiene: PassFail;
  gloves: PassFail;

  details_actions: string | null;
  capa_no: string | null;

  reviewed_by: number | null;
  reviewer_name: string | null;
  reviewed_at: string | null;
}

export interface PPEComplianceLogCreate {
  check_date: string;
  area_id: number;
  staff_count: number;

  hair_net: PassFail;
  beard_net: PassFail;
  clean_uniform: PassFail;
  no_nail_polish: PassFail;
  safety_shoes: PassFail;
  single_use_mask: PassFail;
  no_jewellery: PassFail;
  hand_hygiene: PassFail;
  gloves: PassFail;

  details_actions?: string;
  capa_no?: string;
}

export interface PPEComplianceLogUpdate {
  hair_net?: PassFail;
  beard_net?: PassFail;
  clean_uniform?: PassFail;
  no_nail_polish?: PassFail;
  safety_shoes?: PassFail;
  single_use_mask?: PassFail;
  no_jewellery?: PassFail;
  hand_hygiene?: PassFail;
  gloves?: PassFail;

  details_actions?: string;
  capa_no?: string;
  reviewed_by?: number;
  reviewed_at?: string;
}
