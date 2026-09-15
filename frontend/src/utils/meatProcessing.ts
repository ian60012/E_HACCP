import type { InvItem } from '@/types/inventory';
import type { MeatSave } from '@/types/meatProcessing';

export function isMeatOutputItem(item: InvItem): boolean {
  return item.is_active
    && (['intermediate', 'finished'].includes(item.item_type) || !!item.meat_output_type)
    && ['kg', '公斤'].includes(item.base_unit.trim().toLowerCase());
}

export function toMeatSavePayload(data: MeatSave): MeatSave {
  return {
    version: data.version,
    difference_reason: data.difference_reason,
    inputs: data.inputs.map(row => ({
      inv_item_id: row.inv_item_id, supplier: row.supplier, source_batch: row.source_batch,
      receiving_log_id: row.receiving_log_id, weight_kg: row.weight_kg,
      source_location_id: row.source_location_id, source_lot_id: row.source_lot_id,
    })),
    steps: data.steps.map(row => ({
      kind: row.kind, start_time: row.start_time, end_time: row.end_time, operator: row.operator,
      temperature_c: row.temperature_c, measured_at: row.measured_at, notes: row.notes,
    })),
    outputs: data.outputs.map(row => ({
      inv_item_id: row.inv_item_id, weight_kg: row.weight_kg, pack_count: row.pack_count,
      pack_type: row.pack_type, location_id: row.location_id,
    })),
    losses: data.losses.map(row => ({ kind: row.kind, weight_kg: row.weight_kg, notes: row.notes })),
  };
}
