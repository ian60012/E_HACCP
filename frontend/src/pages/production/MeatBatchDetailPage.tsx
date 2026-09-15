import { ReactNode, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { meatApi, meatError } from '@/api/meatProcessing';
import { prodBatchesApi, packTypesApi } from '@/api/production';
import { invItemsApi, invLocationsApi, invLotsApi } from '@/api/inventory';
import { MeatRecord, MeatSave, meatStates, meatSteps } from '@/types/meatProcessing';
import { ProdBatch, PackTypeConfig } from '@/types/production';
import { InvItem, InvLocation, InvLot } from '@/types/inventory';
import { useAuth } from '@/hooks/useAuth';
import SignaturePad from '@/components/SignaturePad';
import { toMelbourneInput, melbourneToUTC, formatMelbourne } from '@/utils/timezone';

const empty: MeatSave = { version: 0, inputs: [], steps: [], outputs: [], losses: [], difference_reason: '' };
const toDraft = (r: MeatRecord | null): MeatSave => r ? {
  version: r.version, inputs: r.inputs, steps: r.steps, outputs: r.outputs, losses: r.losses, difference_reason: r.difference_reason,
} : empty;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm text-gray-700"><span className="block mb-1">{label}</span>{children}</label>;
}
function TextField({ label, value, onChange, type = 'text', required = false, step, min, maxLength }: {
  label: string; value: string | number | null; onChange: (s: string) => void; type?: string; required?: boolean; step?: string; min?: string; maxLength?: number;
}) {
  return <Field label={label}><input className="input" type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} required={required} step={step} min={min} maxLength={maxLength} /></Field>;
}
function TimeField({ label, value, onChange }: { label: string; value: string | null; onChange: (s: string | null) => void }) {
  return <TextField label={label} type="datetime-local" value={value ? toMelbourneInput(value) : ''} onChange={v => onChange(v ? melbourneToUTC(v) : null)} />;
}

export default function MeatBatchDetailPage() {
  const { id } = useParams(); const batchId = Number(id); const { user } = useAuth();
  const [batch, setBatch] = useState<ProdBatch | null>(null);
  const [record, setRecord] = useState<MeatRecord | null>(null); const [view, setView] = useState<MeatRecord | null>(null);
  const [draft, setDraft] = useState<MeatSave>(empty); const [history, setHistory] = useState<MeatRecord[]>([]);
  const [items, setItems] = useState<InvItem[]>([]); const [locations, setLocations] = useState<InvLocation[]>([]);
  const [packs, setPacks] = useState<PackTypeConfig[]>([]);
  const [lotOptions, setLotOptions] = useState<Record<string, InvLot[] | null>>({});
  const [signature, setSignature] = useState(''); const [verifySignature, setVerifySignature] = useState('');
  const [voidReason, setVoidReason] = useState(''); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [dirty, setDirty] = useState(false);
  const role = user?.role || '';
  const canEdit = ['Admin', 'Production', 'Captain'].includes(role);
  const canVerify = ['Admin', 'QA', 'Captain'].includes(role);
  const canStock = ['Admin', 'Production', 'Warehouse', 'Captain'].includes(role);
  const canVoid = ['Admin', 'Captain'].includes(role);
  const historical = !!view && view.version !== record?.version;
  const editable = canEdit && !historical && !batch?.is_voided && (!record || ['draft', 'submitted'].includes(record.state));

  async function reload() {
    const [b, r, h] = await Promise.all([prodBatchesApi.get(batchId), meatApi.get(batchId), meatApi.history(batchId)]);
    setBatch(b); setRecord(r); setView(r); setDraft(toDraft(r)); setHistory(h); setDirty(false);
  }
  useEffect(() => {
    setLoading(true);
    async function load() {
      await reload();
      // Load all pages rather than silently hiding inventory beyond the first page.
      const all: InvItem[] = []; let skip = 0;
      while (true) { const r = await invItemsApi.list({ skip, limit: 1000 }); all.push(...r.items); skip += r.items.length; if (skip >= r.total || !r.items.length) break; }
      const locs: InvLocation[] = []; skip = 0;
      while (true) { const r = await invLocationsApi.list({ skip, limit: 1000 }); locs.push(...r.items); skip += r.items.length; if (skip >= r.total || !r.items.length) break; }
      const p = await packTypesApi.list({ applicable_type: 'meat_processing' });
      setItems(all); setLocations(locs); setPacks(p);
    }
    load().catch(e => setError(meatError(e))).finally(() => setLoading(false));
  }, [batchId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    draft.inputs.forEach((row) => {
      const item = items.find((x) => x.id === row.inv_item_id);
      if (!item?.lot_tracking_enabled || !row.source_location_id) return;
      const key = `${item.id}:${row.source_location_id}`;
      if (lotOptions[key] !== undefined) return;
      setLotOptions((old) => ({ ...old, [key]: null }));
      invLotsApi.list({ item_id: item.id, location_id: row.source_location_id, positive_only: true, limit: 1000 })
        .then((result) => setLotOptions((old) => ({ ...old, [key]: result.items })))
        .catch(() => setLotOptions((old) => ({ ...old, [key]: [] })));
    });
  }, [draft.inputs, items, lotOptions]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);

  function change(next: MeatSave) { setDraft(next); setDirty(true); setMessage(''); setSignature(''); setVerifySignature(''); }
  async function act(work: () => Promise<unknown>, success: string) {
    setBusy(true); setError(''); setMessage('');
    try { await work(); await reload(); setSignature(''); setVerifySignature(''); setMessage(success); }
    catch (e) { setError(meatError(e)); }
    finally { setBusy(false); }
  }
  function itemOptions(current: number, output = false) {
    return items.filter(i => i.id === current || (i.is_active && (output
      ? (['intermediate', 'finished'].includes(i.item_type) || !!i.meat_output_type) && ['kg', '公斤'].includes(i.base_unit.trim().toLowerCase())
      : ['raw', 'intermediate'].includes(i.item_type)))).map(i => <option key={i.id} value={i.id}>{i.code} — {i.name}</option>);
  }
  const sum = (rows: { weight_kg: string }[]) => rows.reduce((a, r) => a + Math.round((Number(r.weight_kg) || 0) * 1000), 0);
  const input = sum(draft.inputs), output = sum(draft.outputs), loss = sum(draft.losses), diff = input - output - loss;
  const grid = 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3';
  if (loading) return <p role="status">載入中 Loading…</p>;
  if (!batch) return <p role="alert">{error || '找不到批次 Batch not found'}</p>;
  return <div className="space-y-6">
    <Link to="/production/meat" className="text-blue-700" onClick={e => { if (dirty && !window.confirm('尚未儲存，確定離開？ Leave without saving?')) e.preventDefault(); }}>← 肉品加工 Meat Processing</Link>
    <header className="card space-y-2"><h1 className="text-2xl font-bold break-words">{batch.batch_code} · 肉品加工</h1>
      <p>{batch.product_name} · {batch.production_date} · {batch.shift}</p>
      <p>操作人 Operator: {batch.operator || '—'} · 開始 Start: {formatMelbourne(batch.start_time)}</p>
      <strong>{batch.is_voided ? '已作廢 Voided' : meatStates[record?.state || 'draft']}</strong>
      {batch.is_voided && <p className="text-red-700">{batch.void_reason}</p>}
      <p className="text-sm text-gray-600">所有重量以公斤記錄；投入須包含醃料及水。 All weights in kg, including marinade and water.</p>
      {batch.operator_signature_data_url && <img className="h-16 border rounded" src={batch.operator_signature_data_url} alt="建立批次簽名 Batch creation signature" />}
    </header>
    {error && <p role="alert" className="text-red-700 whitespace-pre-wrap">{error}</p>}
    {message && <p role="status" className="text-green-700">{message}</p>}
    <div className="flex flex-wrap gap-3 items-end"><Field label="歷史版本 Revision history"><select className="input" value={view?.version || 0} disabled={dirty || busy} onChange={e => {
      const r = history.find(h => h.version === Number(e.target.value)) || null; setView(r); setDraft(toDraft(r));
    }}>{!history.length && <option value={0}>尚未儲存 Not saved</option>}{history.map(h => <option key={h.id} value={h.version}>v{h.version} · {formatMelbourne(h.created_at)} · {meatStates[h.state]}</option>)}</select></Field>
      <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { if (!dirty || window.confirm('捨棄未儲存修改？ Discard unsaved changes?')) act(reload, '已重新載入 Reloaded'); }}>重新載入 Reload</button>
      {historical && <span>歷史版本唯讀 Read-only history</span>}{dirty && <span role="status">有未儲存修改 Unsaved changes</span>}
    </div>
    <form onSubmit={e => { e.preventDefault(); act(() => meatApi.save(batchId, draft), '已儲存新版本 New revision saved'); }} className="space-y-6">
      <fieldset disabled={!editable || busy} className="space-y-6">
        <section className="card space-y-4"><h2 className="text-lg font-semibold">1. 原料投入 Inputs</h2>
          {draft.inputs.map((r, i) => {
            const patch = (v: Partial<typeof r>) => change({ ...draft, inputs: draft.inputs.map((x, n) => n === i ? { ...x, ...v } : x) });
            const item = items.find((x) => x.id === r.inv_item_id);
            const key = `${r.inv_item_id}:${r.source_location_id || 0}`;
            const lots = lotOptions[key];
            return <div key={i} className="border rounded-lg p-3 space-y-3">
              <div className={grid}>
                <Field label="原料／半成品 Item"><select className="input" value={r.inv_item_id || ''} required onChange={e => {
                  const selected = items.find(x => x.id === Number(e.target.value));
                  patch({ inv_item_id: Number(e.target.value), item_name: selected?.name, supplier: selected?.supplier_name || '', source_batch: '', receiving_log_id: null, source_location_id: null, source_lot_id: null });
                }}><option value="">請選擇 Select</option>{itemOptions(r.inv_item_id)}{!items.some(x => x.id === r.inv_item_id) && r.inv_item_id > 0 && <option value={r.inv_item_id}>{r.item_name || `#${r.inv_item_id}`}</option>}</select></Field>
                <Field label="來源庫位 Source location"><select className="input" required value={r.source_location_id || ''} onChange={e => patch({ source_location_id: Number(e.target.value) || null, source_lot_id: null, source_batch: '' })}>
                  <option value="">請選擇 Select</option>
                  {locations.filter((loc) => loc.id === r.source_location_id || (loc.is_active && item?.allowed_location_ids.includes(loc.id))).map((loc) => <option key={loc.id} value={loc.id}>{loc.code} — {loc.name}</option>)}
                </select></Field>
                {item?.lot_tracking_enabled ? <Field label="來源批號 Source lot"><select className="input" required value={r.source_lot_id || ''} disabled={!r.source_location_id || lots === null} onChange={e => {
                  const lot = lots?.find((x) => x.id === Number(e.target.value));
                  patch({ source_lot_id: lot?.id || null, source_batch: lot?.lot_code || '', supplier: lot?.supplier_name || '內部來源 Internal', receiving_log_id: lot?.receiving_log_id || null });
                }}><option value="">{lots === null ? '載入中 Loading…' : '請選擇 Select'}</option>{lots?.map((lot) => <option key={lot.id} value={lot.id}>{lot.lot_code} · {lot.quantity} kg</option>)}</select></Field> : <>
                  <TextField label="供應商／內部來源 Supplier / internal source" value={r.supplier} required maxLength={200} onChange={supplier => patch({ supplier })} />
                  <TextField label="來源批號 Source batch" value={r.source_batch} required maxLength={100} onChange={source_batch => patch({ source_batch })} />
                </>}
                <TextField label="投入 kg" type="number" min="0.001" step="0.001" required value={r.weight_kg} onChange={weight_kg => patch({ weight_kg })} />
                {item?.lot_tracking_enabled && <div className="text-sm text-gray-600 self-end pb-2">{r.supplier || '—'} · {r.source_batch || '—'}</div>}
                {!item?.lot_tracking_enabled && <TextField label="收貨記錄 ID（選填）Receiving ID" type="number" min="1" step="1" value={r.receiving_log_id} onChange={v => patch({ receiving_log_id: v ? Number(v) : null })} />}
              </div>
              <button type="button" className="text-red-700" onClick={() => change({ ...draft, inputs: draft.inputs.filter((_, n) => n !== i) })}>移除此列 Remove input {i + 1}</button>
            </div>;
          })}
          <button type="button" className="btn btn-secondary" onClick={() => change({ ...draft, inputs: [...draft.inputs, { inv_item_id: 0, supplier: '', source_batch: '', receiving_log_id: null, weight_kg: '', source_location_id: null, source_lot_id: null }] })}>＋ 原料 Add input</button>
        </section>
        <section className="card space-y-4"><h2 className="text-lg font-semibold">2. 加工工序 Processing steps</h2><p className="text-sm text-gray-600">時間採澳洲墨爾本時區；溫度僅記錄實測值。 Times: Australia/Melbourne. Temperatures are observations.</p>
          {draft.steps.map((r, i) => { const patch = (v: Partial<typeof r>) => change({ ...draft, steps: draft.steps.map((x, n) => n === i ? { ...x, ...v } : x) }); return <div key={i} className="border rounded-lg p-3 space-y-3"><h3>工序 Step {i + 1}</h3><div className={grid}>
            <Field label="加工方式 Process"><select className="input" value={r.kind} onChange={e => patch({ kind: e.target.value as typeof r.kind })}>{Object.entries(meatSteps).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <TextField label="操作人 Operator" value={r.operator} required maxLength={100} onChange={operator => patch({ operator })} />
            <TimeField label="開始 Start" value={r.start_time} onChange={start_time => patch({ start_time })} />
            <TimeField label="結束 End" value={r.end_time} onChange={end_time => patch({ end_time })} />
            <TextField label="溫度 °C（選填）Temperature" type="number" step="0.01" value={r.temperature_c} onChange={v => patch({ temperature_c: v || null })} />
            <TimeField label="量測時間 Measured at" value={r.measured_at} onChange={measured_at => patch({ measured_at })} />
            <TextField label="備註 Notes" value={r.notes} onChange={notes => patch({ notes })} />
          </div><button type="button" className="text-red-700" onClick={() => change({ ...draft, steps: draft.steps.filter((_, n) => n !== i) })}>移除此工序 Remove step {i + 1}</button></div>; })}
          <button type="button" className="btn btn-secondary" onClick={() => change({ ...draft, steps: [...draft.steps, { kind: 'trim', operator: user?.full_name || '', start_time: null, end_time: null, temperature_c: null, measured_at: null, notes: '' }] })}>＋ 工序 Add step</button>
        </section>
        <section className="card space-y-4"><h2 className="text-lg font-semibold">3. 產出 Outputs</h2>
          <p className="text-sm">可再利用副產品請列為產出。品項須以公斤管理並設定允許庫位。 Reusable by-products belong here; configure kg items and allowed locations.</p>
          {draft.outputs.map((r, i) => { const patch = (v: Partial<typeof r>) => change({ ...draft, outputs: draft.outputs.map((x, n) => n === i ? { ...x, ...v } : x) }); const item = items.find(x => x.id === r.inv_item_id); return <div key={i} className="border rounded-lg p-3 space-y-3"><div className={grid}>
            <Field label="半成品／成品 Output item"><select className="input" value={r.inv_item_id || ''} required onChange={e => patch({ inv_item_id: Number(e.target.value), location_id: 0 })}><option value="">請選擇 Select</option>{itemOptions(r.inv_item_id, true)}{!item && r.inv_item_id > 0 && <option value={r.inv_item_id}>{r.item_name || `#${r.inv_item_id}`}</option>}</select></Field>
            <TextField label="實際淨重 Net kg" type="number" min="0.001" step="0.001" required value={r.weight_kg} onChange={weight_kg => patch({ weight_kg })} />
            <Field label="入庫庫位 Location"><select className="input" required value={r.location_id || ''} onChange={e => patch({ location_id: Number(e.target.value) })}><option value="">請選擇 Select</option>{locations.filter(l => l.id === r.location_id || (l.is_active && item?.allowed_location_ids.includes(l.id))).map(l => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}{r.location_id > 0 && !locations.some(l => l.id === r.location_id) && <option value={r.location_id}>{r.location_name || `#${r.location_id}`}</option>}</select></Field>
            <TextField label="包數（選填）Pack count" type="number" min="1" step="1" value={r.pack_count} onChange={v => patch({ pack_count: v ? Number(v) : null })} />
            <Field label="包裝方式（選填）Pack type"><select className="input" value={r.pack_type || ''} onChange={e => patch({ pack_type: e.target.value || null })}><option value="">未指定 None</option>{packs.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}{r.pack_type && !packs.some(p => p.code === r.pack_type) && <option value={r.pack_type}>{r.pack_type}</option>}</select></Field>
          </div><button type="button" className="text-red-700" onClick={() => change({ ...draft, outputs: draft.outputs.filter((_, n) => n !== i) })}>移除此列 Remove output {i + 1}</button></div>; })}
          <button type="button" className="btn btn-secondary" onClick={() => change({ ...draft, outputs: [...draft.outputs, { inv_item_id: 0, weight_kg: '', location_id: 0, pack_count: null, pack_type: null }] })}>＋ 產出 Add output</button>
        </section>
        <section className="card space-y-4"><h2 className="text-lg font-semibold">4. 損耗 Losses</h2>
          {draft.losses.map((r, i) => { const patch = (v: Partial<typeof r>) => change({ ...draft, losses: draft.losses.map((x, n) => n === i ? { ...x, ...v } : x) }); return <div key={i} className="border rounded-lg p-3 space-y-3"><div className={grid}>
            <TextField label="分類 Category" value={r.kind} required maxLength={100} onChange={kind => patch({ kind })} />
            <TextField label="損耗 kg" type="number" min="0.001" step="0.001" required value={r.weight_kg} onChange={weight_kg => patch({ weight_kg })} />
            <TextField label="說明 Notes" value={r.notes} onChange={notes => patch({ notes })} />
          </div><button type="button" className="text-red-700" onClick={() => change({ ...draft, losses: draft.losses.filter((_, n) => n !== i) })}>移除此列 Remove loss {i + 1}</button></div>; })}
          <button type="button" className="btn btn-secondary" onClick={() => change({ ...draft, losses: [...draft.losses, { kind: '', weight_kg: '', notes: '' }] })}>＋ 損耗 Add loss</button>
          <Field label="重量差額說明 Difference explanation"><textarea className="input" value={draft.difference_reason} onChange={e => change({ ...draft, difference_reason: e.target.value })} /></Field>
        </section>
      </fieldset>
      <section className="card bg-rose-50 space-y-2"><h2 className="font-semibold">重量彙總 Weight summary</h2><div className="flex flex-wrap gap-5">
        <span>投入 Input {(input / 1000).toFixed(3)} kg</span><span>產出 Output {(output / 1000).toFixed(3)} kg</span><span>損耗 Loss {(loss / 1000).toFixed(3)} kg</span>
        <span>差額 Difference {(diff / 1000).toFixed(3)} kg</span><span>產出率 Yield {input ? (output / input * 100).toFixed(2) : '—'}%</span></div>
        {diff !== 0 && <p>完成前須填寫差額說明，交由 QA 覆核。 Explain the difference before completion.</p>}
      </section>
      {editable && <button className="btn btn-primary" type="submit" disabled={busy || (!dirty && !!record)}>儲存新版本 Save revision</button>}
    </form>
    <section className="card space-y-4"><h2 className="text-lg font-semibold">5. 完成、覆核與入庫 Completion, QA and stock</h2>
      {view?.operator_signature_data_url && <div><p>完成者 Completed by #{view.completed_by} · {formatMelbourne(view.completed_at)}</p><img className="h-20 border" src={view.operator_signature_data_url} alt="加工完成簽名 Completion signature" /></div>}
      {view?.verifier_signature_data_url && <div><p>覆核者 Verified by #{view.verified_by} · {formatMelbourne(view.verified_at)}</p><img className="h-20 border" src={view.verifier_signature_data_url} alt="QA 覆核簽名 QA signature" /></div>}
      {!historical && !batch.is_voided && <>
        {canEdit && record?.state === 'draft' && <><SignaturePad value={signature} onChange={setSignature} required disabled={busy || dirty} label="加工完成簽名 Completion signature" />
          <button className="btn btn-primary" disabled={busy || dirty || !signature} onClick={() => act(() => meatApi.complete(batchId, record.version, signature), '已送交覆核 Submitted to QA')}>完成並送交覆核 Complete</button></>}
        {canVerify && record?.state === 'submitted' && <><SignaturePad value={verifySignature} onChange={setVerifySignature} required disabled={busy || dirty} label="QA 覆核簽名 Verification signature" />
          <p>覆核將鎖定此版本；更正須作廢重建。 Verification locks this revision.</p>
          <button className="btn btn-primary" disabled={busy || dirty || !verifySignature} onClick={() => act(() => meatApi.verify(batchId, record.version, verifySignature), '已覆核並鎖定 Verified and locked')}>覆核並鎖定 Verify</button></>}
        {canStock && record?.state === 'verified' && <button className="btn btn-primary" disabled={busy} onClick={() => act(() => meatApi.enterStock(batchId, record.version), '原料已扣料且產出已按公斤入庫 Inputs consumed and outputs stocked')}>扣料並入庫 Post conversion</button>}
      </>}
      <div className="flex flex-wrap gap-4 text-sm">
        {batch.input_stock_doc_id && <Link className="text-blue-700" to={`/inventory/docs/${batch.input_stock_doc_id}`}>查看投入出庫單 View input OUT #{batch.input_stock_doc_id}</Link>}
        {batch.inv_stock_doc_id && <Link className="text-blue-700" to={`/inventory/docs/${batch.inv_stock_doc_id}`}>查看產出入庫單 View output IN #{batch.inv_stock_doc_id}</Link>}
      </div>
      {canVoid && !batch.is_voided && !historical && <div className="border-t pt-4 space-y-2"><TextField label="作廢理由 Void reason" value={voidReason} onChange={setVoidReason} />
        <button className="btn btn-secondary text-red-700" disabled={busy || !voidReason.trim()} onClick={() => {
          if (window.confirm('作廢此批次並沖回已入庫數量？ Void batch and reverse its stock entry?')) act(() => prodBatchesApi.void(batchId, voidReason), '批次已作廢 Batch voided');
        }}>作廢批次 Void batch</button></div>}
    </section>
  </div>;
}
