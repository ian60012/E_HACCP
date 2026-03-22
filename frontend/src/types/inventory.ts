// ─── Item master ───────────────────────────────────────────────────────────

export interface InvItem {
  id: number;
  code: string;
  name: string;
  category: string | null;
  base_unit: string;
  description: string | null;
  supplier_id: number | null;
  supplier_name: string | null;
  is_active: boolean;
  created_at: string;
  allowed_location_ids: number[];
}

export interface InvItemCreate {
  code: string;
  name: string;
  category?: string;
  base_unit?: string;
  description?: string;
  supplier_id?: number;
  allowed_location_ids?: number[];
}

export interface InvItemUpdate {
  name?: string;
  category?: string;
  base_unit?: string;
  description?: string;
  supplier_id?: number;
  is_active?: boolean;
  allowed_location_ids?: number[];
}

// ─── Location ──────────────────────────────────────────────────────────────

export interface InvLocation {
  id: number;
  code: string;
  name: string;
  zone: string | null;
  is_active: boolean;
}

export interface InvLocationCreate {
  code: string;
  name: string;
  zone?: string;
}

export interface InvLocationUpdate {
  name?: string;
  zone?: string;
  is_active?: boolean;
}

// ─── Document lines ────────────────────────────────────────────────────────

export interface InvStockLine {
  id: number;
  doc_id: number;
  item_id: number;
  item_code: string | null;
  item_name: string | null;
  location_id: number;
  location_name: string | null;
  quantity: string;
  unit: string;
  unit_cost: string | null;
  notes: string | null;
}

export interface InvStockLineCreate {
  item_id: number;
  location_id: number;
  quantity: string;
  unit: string;
  unit_cost?: string;
  notes?: string;
}

// ─── Stock document ────────────────────────────────────────────────────────

export type InvDocType = 'IN' | 'OUT';
export type InvDocStatus = 'Draft' | 'Posted' | 'Voided';

export interface InvStockDoc {
  id: number;
  doc_number: string;
  doc_type: InvDocType;
  status: InvDocStatus;
  location_id: number | null;
  location_name: string | null;
  receiving_log_id: number | null;
  ref_number: string | null;
  notes: string | null;
  void_reason: string | null;
  operator_id: number | null;
  operator_name: string | null;
  created_at: string;
  posted_at: string | null;
  voided_at: string | null;
  lines: InvStockLine[];
}

export interface InvStockDocCreate {
  doc_type: InvDocType;
  location_id?: number;
  ref_number?: string;
  notes?: string;
  lines: InvStockLineCreate[];
}

// ─── Balance ───────────────────────────────────────────────────────────────

export interface InvStockBalance {
  item_id: number;
  item_code: string | null;
  item_name: string | null;
  item_category: string | null;
  base_unit: string | null;
  location_id: number;
  location_code: string | null;
  location_name: string | null;
  quantity: string;
}

// ─── Movement ──────────────────────────────────────────────────────────────

export interface InvStockMovement {
  id: number;
  doc_id: number;
  item_id: number;
  item_name: string | null;
  location_id: number;
  location_name: string | null;
  delta: string;
  balance_after: string;
  created_at: string;
}

// ─── Stocktake (盤點) ──────────────────────────────────────────────────────

export interface InvStocktakeLine {
  id: number;
  item_id: number;
  item_code: string;
  item_name: string;
  item_unit: string;
  location_id: number;
  system_qty: string;
  physical_qty: string | null;
  variance: string | null;
  notes: string | null;
}

export interface InvStocktake {
  id: number;
  doc_number: string;
  status: 'draft' | 'confirmed';
  location_id: number;
  location_name: string;
  count_date: string;
  notes: string | null;
  operator_id: number | null;
  confirmed_at: string | null;
  adj_in_doc_id: number | null;
  adj_out_doc_id: number | null;
  created_at: string;
  lines: InvStocktakeLine[];
}

export interface InvStocktakeCreate {
  location_id: number;
  count_date: string;
  notes?: string;
}

export interface InvStocktakeLineUpdate {
  physical_qty?: string | null;
  notes?: string | null;
}
