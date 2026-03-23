import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, PlusIcon, TrashIcon, PencilIcon } from '@heroicons/react/24/outline';
import { prodBatchesApi, prodProductsApi } from '@/api/production';
import { cookingLogsApi } from '@/api/cooking-logs';
import { coolingLogsApi } from '@/api/cooling-logs';
import { assemblyLogsApi } from '@/api/assembly-logs';
import { invLocationsApi, invItemsApi } from '@/api/inventory';
import {
  ProdBatch, ProdFormingTrolley, ProdFormingTrolleyCreate,
  ProdHotInput, ProdHotInputCreate,
  FormingTotals, HotProcessBalance,
} from '@/types/production';
import { AssemblyPackingLog, AssemblyPackingLogCreate } from '@/types/assembly-log';
import { InvLocation } from '@/types/inventory';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import Bi, { bi } from '@/components/Bi';
import RoleGate from '@/components/RoleGate';
import DateTimeInput from '@/components/DateTimeInput';
import { toMelbourneInput, nowMelbourne, melbourneToUTC, formatMelbourne } from '@/utils/timezone';

const num = (v: any): number => (v == null ? 0 : Number(v));

const statusColors: Record<string, string> = {
  open: 'bg-blue-100 text-blue-800',
  closed: 'bg-green-100 text-green-800',
};

const ccpColors: Record<string, string> = {
  Pass: 'bg-green-100 text-green-700',
  Fail: 'bg-red-100 text-red-700',
  Deviation: 'bg-yellow-100 text-yellow-700',
};

function lossRateClass(rate: number): string {
  if (rate < 25) return 'text-green-600 font-bold';
  if (rate < 45) return 'text-yellow-600 font-bold';
  return 'text-red-600 font-bold';
}

export default function ProdBatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [batch, setBatch] = useState<ProdBatch | null>(null);
  const [productType, setProductType] = useState<'forming' | 'hot_process' | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Header edit
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editOperator, setEditOperator] = useState('');
  const [editSupervisor, setEditSupervisor] = useState('');
  const [headerSaving, setHeaderSaving] = useState(false);

  // Forming trolleys
  const [showTrolleyForm, setShowTrolleyForm] = useState(false);
  const [trolleyForm, setTrolleyForm] = useState<ProdFormingTrolleyCreate>({
    trolley_no: '',
    sampled_tray_count: 0,
    sampled_gross_weight_sum_kg: 0,
    tray_tare_weight_kg: 0,
    total_trays_on_trolley: 0,
    partial_trays_count: 0,
    partial_fill_ratio: 0.5,
    remark: '',
  });
  const [trolleySaving, setTrolleySaving] = useState(false);
  const [formingTotals, setFormingTotals] = useState<FormingTotals | null>(null);

  // Hot process
  const [editInputWeight, setEditInputWeight] = useState('');
  const [inputWeightSaving, setInputWeightSaving] = useState(false);
  const [hotBalance, setHotBalance] = useState<HotProcessBalance | null>(null);

  // Cooking/Cooling log status per hot_input_id
  type LogStatus = { id: number; ccp: string | null };
  const [cookingByInput, setCookingByInput] = useState<Record<number, LogStatus>>({});
  const [coolingByInput, setCoolingByInput] = useState<Record<number, LogStatus>>({});

  // Hot inputs (multiple entries)
  const [showHotInputForm, setShowHotInputForm] = useState(false);
  const [hotInputWeight, setHotInputWeight] = useState('');
  const [hotInputNotes, setHotInputNotes] = useState('');
  const [hotInputSaving, setHotInputSaving] = useState(false);

  // Assembly packing logs (forming)
  const [assemblyLogs, setAssemblyLogs] = useState<AssemblyPackingLog[]>([]);
  const [showAssemblyForm, setShowAssemblyForm] = useState(false);
  const [editingAssemblyId, setEditingAssemblyId] = useState<number | null>(null);
  const [assemblySaving, setAssemblySaving] = useState(false);
  const [assemblyForm, setAssemblyForm] = useState<Omit<AssemblyPackingLogCreate, 'prod_batch_id'>>({
    is_allergen_declared: false,
    is_date_code_correct: undefined,
    target_weight_g: undefined,
    sample_1_g: undefined,
    sample_2_g: undefined,
    sample_3_g: undefined,
    sample_4_g: undefined,
    sample_5_g: undefined,
    seal_integrity: undefined,
    coding_legibility: undefined,
    corrective_action: undefined,
    notes: undefined,
  });

  // Enter stock modal
  const [showEnterStockModal, setShowEnterStockModal] = useState(false);
  const [locations, setLocations] = useState<InvLocation[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
  const [enteringStock, setEnteringStock] = useState(false);

  const fetchBatch = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const [data, options] = await Promise.all([
        prodBatchesApi.get(Number(id)),
        prodProductsApi.formingOptions(),
      ]);
      setBatch(data);
      setEditStartTime(data.start_time ? toMelbourneInput(data.start_time) : nowMelbourne());
      setEditEndTime(data.end_time ? toMelbourneInput(data.end_time) : '');
      setEditOperator(data.operator || '');
      setEditSupervisor(data.supervisor || '');
      setEditInputWeight(data.input_weight_kg ?? '');
      const matched = options.find((o) => o.code === data.product_code);
      setProductType((matched?.product_type as 'forming' | 'hot_process') ?? 'forming');
    } catch {
      setError(bi('error.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchFormingTotals = useCallback(async () => {
    if (!id) return;
    try {
      const totals = await prodBatchesApi.getFormingTotals(Number(id));
      setFormingTotals(totals);
    } catch { /* ignore */ }
  }, [id]);

  const fetchHotBalance = useCallback(async () => {
    if (!id) return;
    try {
      const balance = await prodBatchesApi.getHotProcessBalance(Number(id));
      setHotBalance(balance);
    } catch { /* ignore */ }
  }, [id]);


  const fetchCookingCoolingStatus = useCallback(async () => {
    if (!id) return;
    try {
      const [ckRes, clRes] = await Promise.all([
        cookingLogsApi.list({ prod_batch_id: Number(id), limit: 100 }),
        coolingLogsApi.list({ prod_batch_id: Number(id), limit: 100 }),
      ]);
      const ckMap: Record<number, LogStatus> = {};
      for (const l of ckRes.items) {
        if (l.hot_input_id) ckMap[l.hot_input_id] = { id: l.id, ccp: l.ccp_status };
      }
      const clMap: Record<number, LogStatus> = {};
      for (const l of clRes.items) {
        if (l.hot_input_id) clMap[l.hot_input_id] = { id: l.id, ccp: l.ccp_status };
      }
      setCookingByInput(ckMap);
      setCoolingByInput(clMap);
    } catch { /* ignore */ }
  }, [id]);

  const fetchAssemblyLogs = useCallback(async () => {
    if (!id) return;
    try {
      const res = await assemblyLogsApi.list({ prod_batch_id: Number(id), limit: 100 });
      setAssemblyLogs(res.items);
    } catch { /* ignore */ }
  }, [id]);

  useEffect(() => { fetchBatch(); }, [fetchBatch]);

  useEffect(() => {
    if (productType === 'forming') {
      fetchFormingTotals();
      fetchAssemblyLogs();
    }
    if (productType === 'hot_process') {
      fetchHotBalance();
      fetchCookingCoolingStatus();
      fetchAssemblyLogs();
    }
  }, [productType, fetchFormingTotals, fetchHotBalance, fetchCookingCoolingStatus, fetchAssemblyLogs]);

  const handleSaveHeader = async () => {
    if (!batch) return;
    setHeaderSaving(true);
    try {
      const updated = await prodBatchesApi.update(batch.id, {
        start_time: editStartTime ? melbourneToUTC(editStartTime) : undefined,
        end_time: editEndTime ? melbourneToUTC(editEndTime) : undefined,
        operator: editOperator || undefined,
        supervisor: editSupervisor || undefined,
      });
      setBatch(updated);
    } catch (err: any) {
      setError(err?.response?.data?.detail || bi('error.updateFailed'));
    } finally {
      setHeaderSaving(false);
    }
  };

  const handleSaveInputWeight = async () => {
    if (!batch) return;
    setInputWeightSaving(true);
    try {
      const updated = await prodBatchesApi.update(batch.id, {
        input_weight_kg: editInputWeight ? Number(editInputWeight) : undefined,
      });
      setBatch(updated);
      await fetchHotBalance();
    } catch (err: any) {
      setError(err?.response?.data?.detail || bi('error.updateFailed'));
    } finally {
      setInputWeightSaving(false);
    }
  };

  const handleAddHotInput = async () => {
    if (!batch || !hotInputWeight) return;
    setHotInputSaving(true);
    try {
      await prodBatchesApi.addHotInput(batch.id, {
        weight_kg: hotInputWeight,
        notes: hotInputNotes || undefined,
      } as ProdHotInputCreate);
      setShowHotInputForm(false);
      setHotInputWeight('');
      setHotInputNotes('');
      await fetchBatch();
      await fetchHotBalance();
    } catch (err: any) {
      setError(err?.response?.data?.detail || bi('error.saveFailed'));
    } finally {
      setHotInputSaving(false);
    }
  };

  const handleRemoveHotInput = async (inputId: number) => {
    if (!batch) return;
    if (!confirm('確定要刪除此投料記錄？')) return;
    try {
      await prodBatchesApi.removeHotInput(batch.id, inputId);
      await fetchBatch();
      await fetchHotBalance();
    } catch (err: any) {
      setError(err?.response?.data?.detail || bi('error.deleteFailed'));
    }
  };

  const handleAddTrolley = async () => {
    if (!batch) return;
    setTrolleySaving(true);
    try {
      await prodBatchesApi.addTrolley(batch.id, trolleyForm);
      setShowTrolleyForm(false);
      setTrolleyForm({
        trolley_no: '', sampled_tray_count: 0, sampled_gross_weight_sum_kg: 0,
        tray_tare_weight_kg: 0, total_trays_on_trolley: 0,
        partial_trays_count: 0, partial_fill_ratio: 0.5, remark: '',
      });
      await fetchBatch();
      await fetchFormingTotals();
    } catch (err: any) {
      setError(err?.response?.data?.detail || bi('error.saveFailed'));
    } finally {
      setTrolleySaving(false);
    }
  };

  const handleRemoveTrolley = async (trolleyId: number) => {
    if (!batch) return;
    if (!confirm(bi('confirm.deleteTrolley'))) return;
    try {
      await prodBatchesApi.removeTrolley(batch.id, trolleyId);
      await fetchBatch();
      await fetchFormingTotals();
    } catch (err: any) {
      setError(err?.response?.data?.detail || bi('error.deleteFailed'));
    }
  };

  const handleSaveAssembly = async () => {
    if (!batch) return;
    setAssemblySaving(true);
    try {
      if (editingAssemblyId !== null) {
        await assemblyLogsApi.update(editingAssemblyId, assemblyForm);
      } else {
        await assemblyLogsApi.create({ ...assemblyForm, prod_batch_id: batch.id });
      }
      setShowAssemblyForm(false);
      setEditingAssemblyId(null);
      setAssemblyForm({
        is_allergen_declared: false, is_date_code_correct: undefined,
        target_weight_g: undefined, sample_1_g: undefined, sample_2_g: undefined,
        sample_3_g: undefined, sample_4_g: undefined, sample_5_g: undefined,
        seal_integrity: undefined, coding_legibility: undefined,
        corrective_action: undefined, notes: undefined,
      });
      await fetchAssemblyLogs();
    } catch (err: any) {
      setError(err?.response?.data?.detail || bi('error.saveFailed'));
    } finally {
      setAssemblySaving(false);
    }
  };

  const openEnterStockModal = async () => {
    try {
      const locsRes = await invLocationsApi.list({ is_active: true, limit: 100 });
      let filteredLocs = locsRes.items;

      // Collect inv_item_ids to check allowed_location_ids
      const itemIds = new Set<number>();

      if (productType === 'hot_process') {
        const prodsRes = await prodProductsApi.list({ search: batch?.product_code, limit: 5 });
        const product = prodsRes.items.find((p) => p.code === batch?.product_code);
        if (product?.inv_item_id) itemIds.add(product.inv_item_id);
      }

      // For forming batches, collect inv_item_ids from packing records
      if (productType === 'forming' && batch) {
        for (const rec of batch.packing_records || []) {
          if (rec.inv_item_id) itemIds.add(rec.inv_item_id);
        }
        // Fallback: check the batch's main product
        if (itemIds.size === 0) {
          const prodsRes = await prodProductsApi.list({ search: batch.product_code, limit: 5 });
          const product = prodsRes.items.find((p) => p.code === batch.product_code);
          if (product?.inv_item_id) itemIds.add(product.inv_item_id);
        }
      }

      // Fetch allowed_location_ids from all relevant inv items
      if (itemIds.size > 0) {
        const items = await Promise.all([...itemIds].map((iid) => invItemsApi.get(iid)));
        const allowedIds = new Set<number>();
        let hasRestriction = false;
        for (const item of items) {
          if (item.allowed_location_ids?.length) {
            hasRestriction = true;
            item.allowed_location_ids.forEach((lid) => allowedIds.add(lid));
          }
        }
        if (hasRestriction) {
          filteredLocs = locsRes.items.filter((l) => allowedIds.has(l.id));
        }
      }

      setLocations(filteredLocs);
      setSelectedLocationId(filteredLocs[0]?.id ?? null);
      setShowEnterStockModal(true);
    } catch {
      setError(bi('error.loadFailed'));
    }
  };

  const handleEnterStock = async () => {
    if (!batch || !selectedLocationId) return;
    if (!confirm(bi('confirm.enterStock'))) return;
    setEnteringStock(true);
    try {
      const updated = await prodBatchesApi.enterStock(batch.id, selectedLocationId);
      setBatch(updated);
      setShowEnterStockModal(false);
    } catch (err: any) {
      setError(err?.response?.data?.detail || bi('error.saveFailed'));
    } finally {
      setEnteringStock(false);
    }
  };

  if (loading) return <LoadingSpinner fullPage />;
  if (error && !batch) return <ErrorCard message={error} onRetry={fetchBatch} />;
  if (!batch) return <ErrorCard message={bi('error.loadFailed')} />;

  const isHot = productType === 'hot_process';
  const canEnterStock = batch.status === 'closed' && !batch.inv_stock_doc_id;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/production/batches')} className="p-2 rounded-lg hover:bg-gray-100">
            <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{batch.batch_code}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {batch.product_name}
              {productType && (
                <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${isHot ? 'bg-orange-100 text-orange-700' : 'bg-indigo-100 text-indigo-700'}`}>
                  {isHot ? bi('label.hotProcess') : bi('label.forming')}
                </span>
              )}
              {' '}· {batch.production_date}
              {batch.shift && ` · ${batch.shift}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {batch.inv_stock_doc_id && (
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
              <Bi k="msg.stockEntered" />
            </span>
          )}
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[batch.status] || ''}`}>
            {batch.status}
          </span>
        </div>
      </div>

      {error && <ErrorCard message={error} />}

      {/* Batch info card */}
      <div className="card">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.operator" /></p>
            <p className="font-medium text-gray-800">{batch.operator || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.supervisor" /></p>
            <p className="font-medium text-gray-800">{batch.supervisor || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.startTime" /></p>
            <p className="font-medium text-gray-700">{batch.start_time ? formatMelbourne(batch.start_time, { year: 'numeric' }) : '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.endTime" /></p>
            <p className="font-medium text-gray-700">{batch.end_time ? formatMelbourne(batch.end_time, { year: 'numeric' }) : '—'}</p>
          </div>
          {isHot && (
            <div>
              <p className="text-xs text-gray-400"><Bi k="field.inputWeight" /></p>
              <p className="font-medium text-gray-800">{batch.input_weight_kg ? `${batch.input_weight_kg} kg` : '—'}</p>
            </div>
          )}
        </div>
      </div>

      {/* Edit header if open */}
      <RoleGate roles={['Admin', 'Production']}>
      {batch.status === 'open' && (
        <div className="card space-y-4">
          <h2 className="text-lg font-semibold text-gray-800"><Bi k="section.editBatch" /></h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label text-xs"><Bi k="field.startTime" /></label>
              <DateTimeInput value={editStartTime} onChange={setEditStartTime} />
            </div>
            <div>
              <label className="label text-xs"><Bi k="field.endTime" /></label>
              <DateTimeInput value={editEndTime} onChange={setEditEndTime} />
            </div>
            <div>
              <label className="label text-xs"><Bi k="field.operator" /></label>
              <input type="text" value={editOperator}
                onChange={(e) => setEditOperator(e.target.value)}
                className="input" placeholder={bi('placeholder.operator')} />
            </div>
            <div>
              <label className="label text-xs"><Bi k="field.supervisor" /></label>
              <input type="text" value={editSupervisor}
                onChange={(e) => setEditSupervisor(e.target.value)}
                className="input" placeholder={bi('placeholder.supervisor')} />
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={handleSaveHeader} disabled={headerSaving} className="btn btn-primary">
              {headerSaving ? <Bi k="btn.saving" /> : <Bi k="btn.save" />}
            </button>
          </div>
        </div>
      )}
      </RoleGate>

      {/* ── HOT PROCESS SECTIONS ── */}
      {isHot && (
        <>
          {/* Hot inputs (投料) */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">投料記錄 Hot Inputs</h2>
              {batch.status === 'open' && !showHotInputForm && (
                <RoleGate roles={['Admin', 'Production']}>
                  <button
                    onClick={() => setShowHotInputForm(true)}
                    className="btn btn-secondary text-sm flex items-center gap-1"
                  >
                    <PlusIcon className="h-4 w-4" />新增投料
                  </button>
                </RoleGate>
              )}
            </div>

            {(batch.hot_inputs || []).length === 0 && !showHotInputForm && (
              <p className="text-sm text-gray-400 italic">尚無投料記錄</p>
            )}

            {(batch.hot_inputs || []).length > 0 && (
              <div className="space-y-2">
                {(batch.hot_inputs || []).map((inp: ProdHotInput) => {
                  const subCode = `${batch.batch_code}-${inp.seq}`;
                  const params = new URLSearchParams({
                    prod_batch_id: String(batch.id),
                    batch_code: subCode,
                    hot_input_id: String(inp.id),
                  });
                  if (batch.start_time) params.set('start_time', batch.start_time);
                  return (
                    <div key={inp.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 text-sm">
                      <div>
                        <span className="font-medium text-gray-800">#{inp.seq} · {num(inp.weight_kg).toFixed(3)} kg</span>
                        {inp.notes && <span className="ml-2 text-gray-400 text-xs">{inp.notes}</span>}
                        <span className="ml-2 text-gray-400 text-xs">{subCode}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {cookingByInput[inp.id] ? (
                          <button
                            onClick={() => navigate(`/cooking-logs/${cookingByInput[inp.id].id}`)}
                            className={`text-xs py-1 px-2 rounded-full font-medium ${
                              cookingByInput[inp.id].ccp === 'Pass' ? 'bg-green-100 text-green-700' :
                              cookingByInput[inp.id].ccp === 'Fail' ? 'bg-red-100 text-red-700' :
                              cookingByInput[inp.id].ccp === 'Deviation' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-blue-100 text-blue-700'
                            }`}
                          >
                            🔥 烹煮 {cookingByInput[inp.id].ccp || '進行中'}
                          </button>
                        ) : (
                          <button
                            onClick={() => navigate(`/cooking-logs/new?${params.toString()}`)}
                            className="btn btn-secondary text-xs py-1 px-2"
                          >+烹煮</button>
                        )}
                        {coolingByInput[inp.id] ? (
                          <button
                            onClick={() => navigate(`/cooling-logs/${coolingByInput[inp.id].id}`)}
                            className={`text-xs py-1 px-2 rounded-full font-medium ${
                              coolingByInput[inp.id].ccp === 'Pass' ? 'bg-green-100 text-green-700' :
                              coolingByInput[inp.id].ccp === 'Fail' ? 'bg-red-100 text-red-700' :
                              coolingByInput[inp.id].ccp === 'Deviation' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-cyan-100 text-cyan-700'
                            }`}
                          >
                            ❄️ 冷卻 {coolingByInput[inp.id].ccp || '進行中'}
                          </button>
                        ) : (
                          <button
                            onClick={() => navigate(`/cooling-logs/new?${params.toString()}`)}
                            className="btn btn-secondary text-xs py-1 px-2"
                          >+冷卻</button>
                        )}
                        {batch.status === 'open' && (
                          <RoleGate roles={['Admin', 'Production']}>
                            <button onClick={() => handleRemoveHotInput(inp.id)} className="p-1 rounded hover:bg-red-50">
                              <TrashIcon className="h-4 w-4 text-red-400" />
                            </button>
                          </RoleGate>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {showHotInputForm && (
              <div className="border-t border-gray-100 pt-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-700">新增投料</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label text-xs">投料量 (kg)</label>
                    <input
                      type="number" step="0.001" min="0"
                      value={hotInputWeight}
                      onChange={(e) => setHotInputWeight(e.target.value)}
                      className="input" placeholder="0.000" required
                    />
                  </div>
                  <div>
                    <label className="label text-xs"><Bi k="field.notes" /></label>
                    <input
                      type="text"
                      value={hotInputNotes}
                      onChange={(e) => setHotInputNotes(e.target.value)}
                      className="input" placeholder="備註（可選）"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => { setShowHotInputForm(false); setHotInputWeight(''); setHotInputNotes(''); }} className="btn btn-secondary text-sm">
                    <Bi k="btn.cancel" />
                  </button>
                  <button type="button" onClick={handleAddHotInput} disabled={hotInputSaving || !hotInputWeight} className="btn btn-primary text-sm">
                    {hotInputSaving ? <Bi k="btn.saving" /> : <Bi k="btn.add" />}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Assembly packing logs section (hot process) */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">組裝包裝紀錄 Assembly & Packing</h2>
              {!showAssemblyForm && (
                <button
                  onClick={() => { setEditingAssemblyId(null); setShowAssemblyForm(true); }}
                  className="btn btn-secondary text-sm flex items-center gap-1"
                >
                  <PlusIcon className="h-4 w-4" />新增紀錄
                </button>
              )}
            </div>

            {assemblyLogs.length === 0 && !showAssemblyForm ? (
              <p className="text-sm text-gray-400 italic">—</p>
            ) : (
              <div className="space-y-2">
                {assemblyLogs.map((log) => (
                  <div key={log.id} className={`flex items-center justify-between p-3 rounded-lg bg-gray-50 ${log.is_voided ? 'opacity-50' : ''}`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${log.is_allergen_declared ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          過敏原 {log.is_allergen_declared ? '✓' : '✗'}
                        </span>
                        {log.seal_integrity && (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${log.seal_integrity === 'Pass' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            封口 {log.seal_integrity}
                          </span>
                        )}
                        {log.average_weight_g && (
                          <span className="text-xs text-gray-600">平均重量 {log.average_weight_g}g</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">{formatMelbourne(log.created_at)} · {log.operator_name}</p>
                    </div>
                    {!log.is_locked && !log.is_voided && (
                      <button
                        onClick={() => {
                          setEditingAssemblyId(log.id);
                          setAssemblyForm({
                            is_allergen_declared: log.is_allergen_declared,
                            is_date_code_correct: log.is_date_code_correct ?? undefined,
                            target_weight_g: log.target_weight_g ?? undefined,
                            sample_1_g: log.sample_1_g ?? undefined,
                            sample_2_g: log.sample_2_g ?? undefined,
                            sample_3_g: log.sample_3_g ?? undefined,
                            sample_4_g: log.sample_4_g ?? undefined,
                            sample_5_g: log.sample_5_g ?? undefined,
                            seal_integrity: log.seal_integrity ?? undefined,
                            coding_legibility: log.coding_legibility ?? undefined,
                            corrective_action: log.corrective_action ?? undefined,
                            notes: log.notes ?? undefined,
                          });
                          setShowAssemblyForm(true);
                        }}
                        className="p-1 rounded hover:bg-gray-200 ml-2"
                      >
                        <PencilIcon className="h-4 w-4 text-gray-400" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {showAssemblyForm && (
              <div className="border-t border-gray-100 pt-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-700">
                  {editingAssemblyId ? '編輯紀錄' : '新增組裝包裝紀錄'}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="col-span-2 sm:col-span-3">
                    <label className="label text-xs">過敏原聲明 Allergen Declared *</label>
                    <div className="flex gap-3 mt-1">
                      {[true, false].map((val) => (
                        <label key={String(val)} className="flex items-center gap-1.5 text-sm cursor-pointer">
                          <input
                            type="radio"
                            checked={assemblyForm.is_allergen_declared === val}
                            onChange={() => setAssemblyForm({ ...assemblyForm, is_allergen_declared: val })}
                          />
                          {val ? '已聲明 ✓' : '未聲明 ✗'}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="label text-xs">日期碼正確 Date Code</label>
                    <select
                      value={assemblyForm.is_date_code_correct === undefined ? '' : String(assemblyForm.is_date_code_correct)}
                      onChange={(e) => setAssemblyForm({ ...assemblyForm, is_date_code_correct: e.target.value === '' ? undefined : e.target.value === 'true' })}
                      className="input"
                    >
                      <option value="">—</option>
                      <option value="true">正確 ✓</option>
                      <option value="false">錯誤 ✗</option>
                    </select>
                  </div>
                  <div>
                    <label className="label text-xs">封口完整性 Seal</label>
                    <select
                      value={assemblyForm.seal_integrity || ''}
                      onChange={(e) => setAssemblyForm({ ...assemblyForm, seal_integrity: e.target.value || undefined })}
                      className="input"
                    >
                      <option value="">—</option>
                      <option value="Pass">Pass</option>
                      <option value="Fail">Fail</option>
                    </select>
                  </div>
                  <div>
                    <label className="label text-xs">編碼清晰度 Coding</label>
                    <select
                      value={assemblyForm.coding_legibility || ''}
                      onChange={(e) => setAssemblyForm({ ...assemblyForm, coding_legibility: e.target.value || undefined })}
                      className="input"
                    >
                      <option value="">—</option>
                      <option value="Pass">Pass</option>
                      <option value="Fail">Fail</option>
                    </select>
                  </div>
                  <div>
                    <label className="label text-xs">目標重量 Target (g)</label>
                    <input type="number" step="0.01" min="0" value={assemblyForm.target_weight_g || ''}
                      onChange={(e) => setAssemblyForm({ ...assemblyForm, target_weight_g: e.target.value || undefined })}
                      className="input" placeholder="0.00" />
                  </div>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <div key={n}>
                      <label className="label text-xs">樣本 {n} (g)</label>
                      <input type="number" step="0.01" min="0"
                        value={(assemblyForm as any)[`sample_${n}_g`] || ''}
                        onChange={(e) => setAssemblyForm({ ...assemblyForm, [`sample_${n}_g`]: e.target.value || undefined })}
                        className="input" placeholder="0.00" />
                    </div>
                  ))}
                  <div className="col-span-2 sm:col-span-3">
                    <label className="label text-xs">糾正措施 Corrective Action</label>
                    <textarea
                      value={assemblyForm.corrective_action || ''}
                      onChange={(e) => setAssemblyForm({ ...assemblyForm, corrective_action: e.target.value || undefined })}
                      className="input" rows={2} />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => { setShowAssemblyForm(false); setEditingAssemblyId(null); }} className="btn btn-secondary text-sm">
                    <Bi k="btn.cancel" />
                  </button>
                  <button type="button" onClick={handleSaveAssembly} disabled={assemblySaving} className="btn btn-primary text-sm">
                    {assemblySaving ? <Bi k="btn.saving" /> : <Bi k="btn.save" />}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Material balance card */}
          {hotBalance && (
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-800 mb-4"><Bi k="section.hotProcessBalance" /></h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-400"><Bi k="field.inputWeight" /></p>
                  <p className="text-lg font-bold text-gray-800">
                    {hotBalance.input_weight_kg ? `${num(hotBalance.input_weight_kg).toFixed(3)} kg` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400"><Bi k="field.packedWeight" /></p>
                  <p className="text-lg font-bold text-gray-800">{num(hotBalance.packed_weight_kg).toFixed(3)} kg</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400"><Bi k="field.lossWeight" /></p>
                  <p className="text-lg font-bold text-gray-800">
                    {hotBalance.loss_weight_kg != null ? `${num(hotBalance.loss_weight_kg).toFixed(3)} kg` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400"><Bi k="field.lossRate" /></p>
                  <p className={`text-lg ${hotBalance.loss_rate != null ? lossRateClass(num(hotBalance.loss_rate)) : 'text-gray-400'}`}>
                    {hotBalance.loss_rate != null ? `${num(hotBalance.loss_rate).toFixed(1)}%` : '—'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── FORMING SECTIONS ── */}
      {!isHot && (
        <>
          {/* Trolley Table */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800"><Bi k="section.trolleys" /></h2>
              {batch.status === 'open' && (
                <RoleGate roles={['Admin', 'Production']}>
                  <button
                    type="button"
                    onClick={() => setShowTrolleyForm(!showTrolleyForm)}
                    className="btn btn-secondary text-sm flex items-center gap-1"
                  >
                    <PlusIcon className="h-4 w-4" /><Bi k="btn.addTrolley" />
                  </button>
                </RoleGate>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                    <th className="pb-2 pr-3"><Bi k="field.trolleyNo" /></th>
                    <th className="pb-2 pr-3"><Bi k="field.sampledTrayCount" /></th>
                    <th className="pb-2 pr-3"><Bi k="field.sampledGrossWeight" /></th>
                    <th className="pb-2 pr-3"><Bi k="field.trayTareWeight" /></th>
                    <th className="pb-2 pr-3"><Bi k="field.totalTrays" /></th>
                    <th className="pb-2 pr-3"><Bi k="field.partialTrays" /></th>
                    <th className="pb-2 pr-3"><Bi k="field.partialFill" /></th>
                    <th className="pb-2 pr-3"><Bi k="field.avgTrayNet" /></th>
                    <th className="pb-2 pr-3"><Bi k="field.eqTrayCount" /></th>
                    <th className="pb-2 pr-3"><Bi k="field.estNetWeight" /></th>
                    <th className="pb-2 pr-3"><Bi k="field.remark" /></th>
                    {batch.status === 'open' && <th className="pb-2" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {batch.trolleys.map((t: ProdFormingTrolley) => (
                    <tr key={t.id}>
                      <td className="py-2 pr-3 font-medium text-gray-800">{t.trolley_no}</td>
                      <td className="py-2 pr-3 text-gray-500">{t.sampled_tray_count}</td>
                      <td className="py-2 pr-3 text-gray-500">{t.sampled_gross_weight_sum_kg}</td>
                      <td className="py-2 pr-3 text-gray-500">{t.tray_tare_weight_kg}</td>
                      <td className="py-2 pr-3 text-gray-500">{t.total_trays_on_trolley}</td>
                      <td className="py-2 pr-3 text-gray-500">{t.partial_trays_count}</td>
                      <td className="py-2 pr-3 text-gray-500">{t.partial_fill_ratio}</td>
                      <td className="py-2 pr-3 text-gray-500">{t.avg_tray_net_weight_kg != null ? num(t.avg_tray_net_weight_kg).toFixed(3) : '—'}</td>
                      <td className="py-2 pr-3 text-gray-500">{t.equivalent_tray_count != null ? num(t.equivalent_tray_count).toFixed(1) : '—'}</td>
                      <td className="py-2 pr-3 text-gray-500">{t.estimated_net_weight_kg != null ? num(t.estimated_net_weight_kg).toFixed(2) : '—'}</td>
                      <td className="py-2 pr-3 text-gray-400 text-xs">{t.remark || '—'}</td>
                      {batch.status === 'open' && (
                        <td className="py-2">
                          <RoleGate roles={['Admin', 'Production']}>
                            <button onClick={() => handleRemoveTrolley(t.id)} className="p-1 rounded hover:bg-red-50">
                              <TrashIcon className="h-4 w-4 text-red-400" />
                            </button>
                          </RoleGate>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Inline trolley add form */}
            {showTrolleyForm && (
              <div className="border-t border-gray-100 pt-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-700"><Bi k="section.newTrolley" /></h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="label text-xs"><Bi k="field.trolleyNo" /></label>
                    <input type="text" value={trolleyForm.trolley_no}
                      onChange={(e) => setTrolleyForm({ ...trolleyForm, trolley_no: e.target.value })}
                      className="input" required />
                  </div>
                  <div>
                    <label className="label text-xs"><Bi k="field.sampledTrayCount" /></label>
                    <input type="number" min="1" value={trolleyForm.sampled_tray_count || ''}
                      onChange={(e) => setTrolleyForm({ ...trolleyForm, sampled_tray_count: Number(e.target.value) })}
                      className="input" required />
                  </div>
                  <div>
                    <label className="label text-xs"><Bi k="field.sampledGrossWeight" /></label>
                    <input type="number" step="0.001" min="0" value={trolleyForm.sampled_gross_weight_sum_kg || ''}
                      onChange={(e) => setTrolleyForm({ ...trolleyForm, sampled_gross_weight_sum_kg: Number(e.target.value) })}
                      className="input" required />
                  </div>
                  <div>
                    <label className="label text-xs"><Bi k="field.trayTareWeight" /></label>
                    <input type="number" step="0.001" min="0" value={trolleyForm.tray_tare_weight_kg || ''}
                      onChange={(e) => setTrolleyForm({ ...trolleyForm, tray_tare_weight_kg: Number(e.target.value) })}
                      className="input" required />
                  </div>
                  <div>
                    <label className="label text-xs"><Bi k="field.totalTrays" /></label>
                    <input type="number" min="1" value={trolleyForm.total_trays_on_trolley || ''}
                      onChange={(e) => setTrolleyForm({ ...trolleyForm, total_trays_on_trolley: Number(e.target.value) })}
                      className="input" required />
                  </div>
                  <div>
                    <label className="label text-xs"><Bi k="field.partialTrays" /></label>
                    <input type="number" min="0" value={trolleyForm.partial_trays_count ?? 0}
                      onChange={(e) => setTrolleyForm({ ...trolleyForm, partial_trays_count: Number(e.target.value) })}
                      className="input" />
                  </div>
                  <div>
                    <label className="label text-xs"><Bi k="field.partialFill" /></label>
                    <input type="number" step="0.01" min="0" max="1" value={trolleyForm.partial_fill_ratio ?? 0.5}
                      onChange={(e) => setTrolleyForm({ ...trolleyForm, partial_fill_ratio: Number(e.target.value) })}
                      className="input" />
                  </div>
                  <div>
                    <label className="label text-xs"><Bi k="field.remark" /></label>
                    <input type="text" value={trolleyForm.remark || ''}
                      onChange={(e) => setTrolleyForm({ ...trolleyForm, remark: e.target.value })}
                      className="input" placeholder={bi('placeholder.remark')} />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setShowTrolleyForm(false)} className="btn btn-secondary text-sm">
                    <Bi k="btn.cancel" />
                  </button>
                  <button type="button" onClick={handleAddTrolley} disabled={trolleySaving} className="btn btn-primary text-sm">
                    {trolleySaving ? <Bi k="btn.saving" /> : <Bi k="btn.add" />}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Assembly packing logs section */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">組裝包裝紀錄 Assembly & Packing</h2>
              {!showAssemblyForm && (
                <button
                  onClick={() => { setEditingAssemblyId(null); setShowAssemblyForm(true); }}
                  className="btn btn-secondary text-sm flex items-center gap-1"
                >
                  <PlusIcon className="h-4 w-4" />新增紀錄
                </button>
              )}
            </div>

            {/* Assembly log list */}
            {assemblyLogs.length === 0 && !showAssemblyForm ? (
              <p className="text-sm text-gray-400 italic">—</p>
            ) : (
              <div className="space-y-2">
                {assemblyLogs.map((log) => (
                  <div key={log.id} className={`flex items-center justify-between p-3 rounded-lg bg-gray-50 ${log.is_voided ? 'opacity-50' : ''}`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${log.is_allergen_declared ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          過敏原 {log.is_allergen_declared ? '✓' : '✗'}
                        </span>
                        {log.seal_integrity && (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${log.seal_integrity === 'Pass' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            封口 {log.seal_integrity}
                          </span>
                        )}
                        {log.average_weight_g && (
                          <span className="text-xs text-gray-600">平均重量 {log.average_weight_g}g</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">{formatMelbourne(log.created_at)} · {log.operator_name}</p>
                    </div>
                    {!log.is_locked && !log.is_voided && (
                      <button
                        onClick={() => {
                          setEditingAssemblyId(log.id);
                          setAssemblyForm({
                            is_allergen_declared: log.is_allergen_declared,
                            is_date_code_correct: log.is_date_code_correct ?? undefined,
                            target_weight_g: log.target_weight_g ?? undefined,
                            sample_1_g: log.sample_1_g ?? undefined,
                            sample_2_g: log.sample_2_g ?? undefined,
                            sample_3_g: log.sample_3_g ?? undefined,
                            sample_4_g: log.sample_4_g ?? undefined,
                            sample_5_g: log.sample_5_g ?? undefined,
                            seal_integrity: log.seal_integrity ?? undefined,
                            coding_legibility: log.coding_legibility ?? undefined,
                            corrective_action: log.corrective_action ?? undefined,
                            notes: log.notes ?? undefined,
                          });
                          setShowAssemblyForm(true);
                        }}
                        className="p-1 rounded hover:bg-gray-200 ml-2"
                      >
                        <PencilIcon className="h-4 w-4 text-gray-400" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Inline assembly form */}
            {showAssemblyForm && (
              <div className="border-t border-gray-100 pt-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-700">
                  {editingAssemblyId ? '編輯紀錄' : '新增組裝包裝紀錄'}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="col-span-2 sm:col-span-3">
                    <label className="label text-xs">過敏原聲明 Allergen Declared *</label>
                    <div className="flex gap-3 mt-1">
                      {[true, false].map((val) => (
                        <label key={String(val)} className="flex items-center gap-1.5 text-sm cursor-pointer">
                          <input
                            type="radio"
                            checked={assemblyForm.is_allergen_declared === val}
                            onChange={() => setAssemblyForm({ ...assemblyForm, is_allergen_declared: val })}
                          />
                          {val ? '已聲明 ✓' : '未聲明 ✗'}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="label text-xs">日期碼正確 Date Code</label>
                    <select
                      value={assemblyForm.is_date_code_correct === undefined ? '' : String(assemblyForm.is_date_code_correct)}
                      onChange={(e) => setAssemblyForm({ ...assemblyForm, is_date_code_correct: e.target.value === '' ? undefined : e.target.value === 'true' })}
                      className="input"
                    >
                      <option value="">—</option>
                      <option value="true">正確 ✓</option>
                      <option value="false">錯誤 ✗</option>
                    </select>
                  </div>
                  <div>
                    <label className="label text-xs">封口完整性 Seal</label>
                    <select
                      value={assemblyForm.seal_integrity || ''}
                      onChange={(e) => setAssemblyForm({ ...assemblyForm, seal_integrity: e.target.value || undefined })}
                      className="input"
                    >
                      <option value="">—</option>
                      <option value="Pass">Pass</option>
                      <option value="Fail">Fail</option>
                    </select>
                  </div>
                  <div>
                    <label className="label text-xs">編碼清晰度 Coding</label>
                    <select
                      value={assemblyForm.coding_legibility || ''}
                      onChange={(e) => setAssemblyForm({ ...assemblyForm, coding_legibility: e.target.value || undefined })}
                      className="input"
                    >
                      <option value="">—</option>
                      <option value="Pass">Pass</option>
                      <option value="Fail">Fail</option>
                    </select>
                  </div>
                  <div>
                    <label className="label text-xs">目標重量 Target (g)</label>
                    <input type="number" step="0.01" min="0" value={assemblyForm.target_weight_g || ''}
                      onChange={(e) => setAssemblyForm({ ...assemblyForm, target_weight_g: e.target.value || undefined })}
                      className="input" placeholder="0.00" />
                  </div>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <div key={n}>
                      <label className="label text-xs">樣本 {n} (g)</label>
                      <input type="number" step="0.01" min="0"
                        value={(assemblyForm as any)[`sample_${n}_g`] || ''}
                        onChange={(e) => setAssemblyForm({ ...assemblyForm, [`sample_${n}_g`]: e.target.value || undefined })}
                        className="input" placeholder="0.00" />
                    </div>
                  ))}
                  <div className="col-span-2 sm:col-span-3">
                    <label className="label text-xs">糾正措施 Corrective Action</label>
                    <textarea
                      value={assemblyForm.corrective_action || ''}
                      onChange={(e) => setAssemblyForm({ ...assemblyForm, corrective_action: e.target.value || undefined })}
                      className="input" rows={2} />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => { setShowAssemblyForm(false); setEditingAssemblyId(null); }} className="btn btn-secondary text-sm">
                    <Bi k="btn.cancel" />
                  </button>
                  <button type="button" onClick={handleSaveAssembly} disabled={assemblySaving} className="btn btn-primary text-sm">
                    {assemblySaving ? <Bi k="btn.saving" /> : <Bi k="btn.save" />}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Forming Totals */}
          {formingTotals && (
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-800 mb-4"><Bi k="section.formingTotals" /></h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-400"><Bi k="field.totalNetWeight" /></p>
                  <p className="text-lg font-bold text-gray-800">{num(formingTotals.total_net_weight_kg).toFixed(2)} kg</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400"><Bi k="field.totalPieces" /></p>
                  <p className="text-lg font-bold text-gray-800">{formingTotals.total_pieces}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400"><Bi k="field.durationMin" /></p>
                  <p className="text-lg font-bold text-gray-800">{formingTotals.duration_minutes ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400"><Bi k="field.piecesPerHour" /></p>
                  <p className="text-lg font-bold text-gray-800">{formingTotals.pieces_per_hour != null ? num(formingTotals.pieces_per_hour).toFixed(0) : '—'}</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Bottom actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => navigate('/production/batches')} className="btn btn-secondary">
          <Bi k="btn.back" />
        </button>
        <RoleGate roles={['Admin', 'Production']}>
          <button
            onClick={() => navigate(`/production/batches/${batch.id}/packing`)}
            className="btn btn-primary"
          >
            <Bi k="btn.viewPacking" />
          </button>
        </RoleGate>
        {canEnterStock && (
          <RoleGate roles={['Admin', 'Production', 'Warehouse']}>
            <button onClick={openEnterStockModal} className="btn bg-orange-500 text-white hover:bg-orange-600">
              <Bi k="btn.enterStock" />
            </button>
          </RoleGate>
        )}
        {batch.inv_stock_doc_id && (
          <button
            onClick={() => navigate(`/inventory/docs/${batch.inv_stock_doc_id}`)}
            className="btn btn-secondary"
          >
            <Bi k="btn.viewStockDoc" />
          </button>
        )}
      </div>

      {/* Enter stock modal */}
      {showEnterStockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="text-lg font-semibold text-gray-800"><Bi k="btn.enterStock" /></h3>
            <div>
              <label className="label text-xs"><Bi k="placeholder.selectLocation" /></label>
              <select
                value={selectedLocationId ?? ''}
                onChange={(e) => setSelectedLocationId(Number(e.target.value))}
                className="input"
              >
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.code} — {loc.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowEnterStockModal(false)} className="btn btn-secondary">
                <Bi k="btn.cancel" />
              </button>
              <button
                onClick={handleEnterStock}
                disabled={enteringStock || !selectedLocationId}
                className="btn bg-orange-500 text-white hover:bg-orange-600"
              >
                {enteringStock ? <Bi k="btn.saving" /> : <Bi k="btn.enterStock" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
