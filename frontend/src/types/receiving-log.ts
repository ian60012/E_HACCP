import { ALCOAFields } from './common';

export const QUANTITY_UNITS = ['KG', '包', '箱', '袋', '罐', '卷'] as const;
export type QuantityUnit = typeof QUANTITY_UNITS[number];

export interface ReceivingLog extends ALCOAFields {
  id: number;
  supplier_id: number;
  supplier_name: string | null;
  po_number: string | null;
  product_name: string | null;
  quantity: string | null;
  quantity_unit: string | null;
  temp_chilled: string | null;
  temp_frozen: string | null;
  vehicle_cleanliness: 'Pass' | 'Fail';
  packaging_integrity: 'Pass' | 'Fail';
  acceptance_status: 'Accept' | 'Reject' | 'Hold';
  corrective_action: string | null;
  notes: string | null;
}

export interface ReceivingLogCreate {
  supplier_id: number;
  po_number?: string;
  product_name?: string;
  quantity?: string;
  quantity_unit?: string;
  temp_chilled?: string;
  temp_frozen?: string;
  vehicle_cleanliness: 'Pass' | 'Fail';
  packaging_integrity: 'Pass' | 'Fail';
  acceptance_status?: 'Accept' | 'Reject' | 'Hold';
  corrective_action?: string;
  notes?: string;
}

export interface ReceivingLogUpdate {
  acceptance_status?: 'Accept' | 'Reject' | 'Hold';
  corrective_action?: string;
  notes?: string;
}
