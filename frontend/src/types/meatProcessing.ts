export type MeatState = 'draft' | 'submitted' | 'verified' | 'stocked';
export const meatStates: Record<MeatState, string> = {
  draft: '加工中 In progress', submitted: '待覆核 Awaiting QA',
  verified: '已覆核 Verified', stocked: '已入庫 Stocked',
};
export const meatSteps = {
  thaw: '解凍 Thaw', trim: '修清 Trim', slice: '切片 Slice',
  dice: '切塊 Dice', mince: '絞肉 Mince', marinate: '醃製 Marinate',
};
export interface MeatInput {
  inv_item_id: number; supplier: string; source_batch: string;
  receiving_log_id: number | null; weight_kg: string; item_name?: string;
  source_location_id: number | null; source_lot_id: number | null;
  source_location_name?: string | null; source_lot_code?: string | null;
}
export interface MeatStep {
  kind: keyof typeof meatSteps; start_time: string | null; end_time: string | null;
  operator: string; temperature_c: string | null; measured_at: string | null; notes: string;
}
export interface MeatOutput {
  inv_item_id: number; weight_kg: string; pack_count: number | null;
  pack_type: string | null; location_id: number; item_name?: string; location_name?: string;
}
export interface MeatLoss { kind: string; weight_kg: string; notes: string }
export interface MeatSave {
  version: number; difference_reason: string;
  inputs: MeatInput[]; steps: MeatStep[]; outputs: MeatOutput[]; losses: MeatLoss[];
}
export interface MeatTotals {
  input_kg: string; output_kg: string; loss_kg: string; difference_kg: string; yield_pct: string | null;
}
export interface MeatRecord extends MeatSave {
  id: number; batch_id: number; state: MeatState; totals: MeatTotals;
  created_by: number; created_at: string; completed_by: number | null; completed_at: string | null;
  operator_signature_data_url: string | null; verified_by: number | null; verified_at: string | null;
  verifier_signature_data_url: string | null;
}
