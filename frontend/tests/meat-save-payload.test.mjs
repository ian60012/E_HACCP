import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/utils/meatProcessing.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { toMeatSavePayload } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('loaded lot and non-lot rows can save without response snapshots or metadata', () => {
  const writable = {
    version: 3, difference_reason: '修清損耗',
    inputs: [
      { inv_item_id: 1, supplier: 'Farm', source_batch: 'LOT-001', receiving_log_id: 5, weight_kg: '10.125', source_location_id: 2, source_lot_id: 7 },
      { inv_item_id: 3, supplier: 'Kitchen', source_batch: 'WATER-001', receiving_log_id: null, weight_kg: '1.000', source_location_id: 2, source_lot_id: null },
    ],
    steps: [{ kind: 'slice', start_time: '2026-09-15T00:00:00Z', end_time: '2026-09-15T01:00:00Z', operator: 'Operator', temperature_c: null, measured_at: null, notes: '切片' }],
    outputs: [{ inv_item_id: 4, weight_kg: '10.000', pack_count: 20, pack_type: 'MEAT-500', location_id: 9 }],
    losses: [{ kind: 'trim', weight_kg: '1.125', notes: '修除' }],
  };
  const loaded = {
    ...structuredClone(writable), id: 12, batch_id: 6, state: 'draft', totals: { input_kg: '11.125' },
    inputs: writable.inputs.map(row => ({ ...row, item_name: 'Pork', source_location_name: 'Freezer', source_lot_code: row.source_lot_id ? 'LOT-001' : null, future_display_field: 'display only' })),
    outputs: writable.outputs.map(row => ({ ...row, item_name: 'Sliced pork', location_name: 'Finished freezer', future_display_field: 'display only' })),
    steps: writable.steps.map(row => ({ ...row, future_display_field: 'display only' })),
    losses: writable.losses.map(row => ({ ...row, future_display_field: 'display only' })),
  };
  const before = structuredClone(loaded);
  assert.deepEqual(toMeatSavePayload(loaded), writable);
  assert.deepEqual(loaded, before);
});

test('new batches keep empty detail lists without introducing display fields', () => {
  const data = { version: 0, difference_reason: '', inputs: [], steps: [], outputs: [], losses: [] };
  assert.deepEqual(toMeatSavePayload(data), data);
});
