// Production module types

export type ProdBatchStatus = 'open' | 'closed';
export type ProdShift = 'Morning' | 'Night';
export type ProdPackType = '4KG_SEMI' | '1KG_FG' | '0.5KG_FG' | 'BULK_KG';
export type ProdProductType = 'forming' | 'hot_process';
export type PackApplicableType = 'forming' | 'hot_process' | 'both';

// ----- Pack Type Config -----
export interface PackTypeConfig {
  id: number;
  code: string;
  name: string;
  applicable_type: PackApplicableType;
  nominal_weight_kg: number | null;
  is_active: boolean;
  created_at: string;
}

export interface PackTypeConfigCreate {
  code: string;
  name: string;
  applicable_type?: PackApplicableType;
  nominal_weight_kg?: number | null;
}

export interface PackTypeConfigUpdate {
  name?: string;
  applicable_type?: PackApplicableType;
  nominal_weight_kg?: number | null;
  is_active?: boolean;
}

export interface FormingOption {
  id: number;
  code: string;
  name: string;
  product_type: ProdProductType;
  ccp_limit_temp: string | null;
  pack_size_kg: number | null;
  loss_rate_warn_pct: number | null;
}

// ----- Products -----
export interface ProdProduct {
  id: number;
  code: string;
  name: string;
  ccp_limit_temp: string;
  pack_size_kg: number | null;
  loss_rate_warn_pct: number | null;
  product_type: ProdProductType;
  inv_item_id: number | null;
  is_active: boolean;
  created_at: string;
}

export interface ProdProductCreate {
  code: string;
  name: string;
  ccp_limit_temp?: string;
  pack_size_kg?: number | null;
  loss_rate_warn_pct?: number | null;
  product_type?: ProdProductType;
  inv_item_id?: number | null;
}

export interface ProdProductUpdate {
  name?: string;
  ccp_limit_temp?: string;
  pack_size_kg?: number | null;
  loss_rate_warn_pct?: number | null;
  product_type?: ProdProductType;
  inv_item_id?: number | null;
  is_active?: boolean;
}

// ----- Forming Trolleys -----
export interface ProdFormingTrolley {
  id: number;
  batch_id: number;
  trolley_no: string;
  sampled_tray_count: number;
  sampled_gross_weight_sum_kg: number;
  tray_tare_weight_kg: number;
  total_trays_on_trolley: number;
  partial_trays_count: number;
  partial_fill_ratio: number;
  avg_tray_net_weight_kg: number | null;
  equivalent_tray_count: number | null;
  estimated_net_weight_kg: number | null;
  remark: string | null;
}

export interface ProdFormingTrolleyCreate {
  trolley_no: string;
  sampled_tray_count: number;
  sampled_gross_weight_sum_kg: number;
  tray_tare_weight_kg: number;
  total_trays_on_trolley: number;
  partial_trays_count?: number;
  partial_fill_ratio?: number;
  remark?: string;
}

// ----- Packing -----
export interface ProdPackingRecord {
  id: number;
  batch_id: number;
  pack_type: ProdPackType;
  product_id: number | null;
  product_name: string | null;
  inv_item_id: number | null;
  inv_item_name: string | null;
  bag_count: number;
  nominal_weight_kg: number;
  theoretical_total_weight_kg: number | null;
  remark: string | null;
}

export interface ProdPackingRecordCreate {
  pack_type: ProdPackType;
  product_id?: number | null;
  inv_item_id?: number;
  bag_count: number;
  nominal_weight_kg: number;
  remark?: string;
}

export interface ProdPackingTrim {
  id: number;
  batch_id: number;
  trim_type: string;
  weight_kg: number;
  remark: string | null;
}

export interface ProdPackingTrimCreate {
  trim_type: string;
  weight_kg: number;
  remark?: string;
}

export interface ProdPackingSaveRequest {
  records: ProdPackingRecordCreate[];
  trims: ProdPackingTrimCreate[];
}

// ----- Hot Inputs (熱加工投料) -----
export interface ProdHotInput {
  id: number;
  prod_batch_id: number;
  seq: number;
  weight_kg: string;
  notes: string | null;
  created_at: string;
}

export interface ProdHotInputCreate {
  weight_kg: number | string;
  notes?: string;
}

// ----- Batches -----
export interface ProdBatch {
  id: number;
  batch_code: string;
  product_code: string;
  product_name: string;
  production_date: string;
  shift: ProdShift | null;
  spec_piece_weight_g: number;
  start_time: string | null;
  end_time: string | null;
  status: ProdBatchStatus;
  operator: string | null;
  supervisor: string | null;
  estimated_forming_net_weight_kg: string | null;
  estimated_forming_pieces: number | null;
  input_weight_kg: string | null;
  inv_stock_doc_id: number | null;
  created_at: string;
  trolleys: ProdFormingTrolley[];
  packing_records: ProdPackingRecord[];
  packing_trims: ProdPackingTrim[];
  hot_inputs: ProdHotInput[];
}

export interface ProdBatchCreate {
  product_code: string;
  product_name: string;
  production_date: string;
  shift?: ProdShift;
  spec_piece_weight_g?: number;
  start_time?: string;
  operator?: string;
  supervisor?: string;
  input_weight_kg?: number;
}

export interface ProdBatchUpdate {
  shift?: ProdShift;
  spec_piece_weight_g?: number;
  start_time?: string;
  end_time?: string;
  operator?: string;
  supervisor?: string;
  input_weight_kg?: number;
}

// ----- Hot Process Balance -----
export interface HotProcessBalance {
  input_weight_kg: string | null;
  packed_weight_kg: string;
  loss_weight_kg: string | null;
  loss_rate: string | null;
}

// ----- Repack -----
export interface ProdRepackInput {
  id: number;
  repack_job_id: number;
  from_batch_id: number | null;
  from_batch_code: string | null;
  product_id: number | null;
  product_name: string | null;
  bag_count: number;
  nominal_weight_kg: number;
  total_weight_kg: number | null;
}

export interface ProdRepackInputCreate {
  from_batch_id?: number;
  product_id?: number;
  bag_count: number;
  nominal_weight_kg: number;
}

export interface ProdRepackOutput {
  id: number;
  repack_job_id: number;
  pack_type: ProdPackType;
  product_id: number | null;
  product_name: string | null;
  bag_count: number;
  nominal_weight_kg: number;
  total_weight_kg: number | null;
}

export interface ProdRepackOutputCreate {
  pack_type: ProdPackType;
  product_id?: number;
  bag_count: number;
  nominal_weight_kg: number;
}

export interface ProdRepackTrim {
  id: number;
  repack_job_id: number;
  trim_type: string;
  weight_kg: number;
  remark: string | null;
}

export interface ProdRepackTrimCreate {
  trim_type: string;
  weight_kg: number;
  remark?: string;
}

export interface ProdRepackJob {
  id: number;
  new_batch_code: string;
  date: string;
  operator: string | null;
  remark: string | null;
  created_at: string;
  inputs: ProdRepackInput[];
  outputs: ProdRepackOutput[];
  trims: ProdRepackTrim[];
}

export interface ProdRepackJobCreate {
  date: string;
  operator?: string;
  remark?: string;
}

// ----- Calculation responses -----
export interface FormingTotals {
  total_net_weight_kg: number;
  total_pieces: number;
  duration_minutes: number | null;
  pieces_per_hour: number | null;
}

export interface PackingTotals {
  forming_input_kg: number;
  total_4kg_kg: number;
  total_retail_kg: number;
  total_trim_kg: number;
  output_total_kg: number;
  loss_kg: number;
  loss_rate: number;
}

export interface RepackTotals {
  input_total_kg: number;
  output_total_kg: number;
  trim_total_kg: number;
  loss_kg: number;
  loss_rate: number;
}
