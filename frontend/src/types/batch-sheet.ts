// Daily Batch Sheet types (FSP-LOG-017)

export interface ReceivingLogSummary {
  id: number;
  po_number: string | null;
  supplier_name: string | null;
  created_at: string;
}

export interface ProdBatchSheetLine {
  id: number;
  sheet_id: number;
  inv_item_id: number | null;
  ingredient_name: string;
  receiving_log_id: number | null;
  receiving_log: ReceivingLogSummary | null;
  supplier: string | null;
  supplier_batch_no: string | null;
  qty_used: string | null;
  unit: string | null;
  seq: number;
}

export interface ProdDailyBatchSheet {
  id: number;
  batch_id: number;
  operator_id: number | null;
  operator_name: string | null;
  verified_by: number | null;
  verifier_name: string | null;
  verified_at: string | null;
  is_locked: boolean;
  created_at: string;
  lines: ProdBatchSheetLine[];
}

export interface ProdBatchSheetLineCreate {
  inv_item_id: number | null;
  ingredient_name: string;
  receiving_log_id: number | null;
  supplier: string | null;
  supplier_batch_no: string | null;
  qty_used: string | null;
  unit: string | null;
  seq: number;
}

export interface SaveBatchSheetRequest {
  operator_name?: string;
  lines: ProdBatchSheetLineCreate[];
}

export interface BatchSheetSummary {
  batch_id: number;
  batch_code: string;
  product_name: string;
  production_date: string;
  sheet_id: number | null;
  has_sheet: boolean;
  is_locked: boolean;
  line_count: number;
  operator_name: string | null;
  verified_by: number | null;
}
