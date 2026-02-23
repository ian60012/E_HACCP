import { ALCOAFields } from './common';

export interface ReceivingLog extends ALCOAFields {
  id: number;
  supplier_id: number;
  supplier_name: string | null;
  po_number: string | null;
  product_name: string | null;
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
