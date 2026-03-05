import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { prodBatchesApi, prodProductsApi } from '@/api/production';
import { cookingLogsApi } from '@/api/cooking-logs';
import { invLocationsApi } from '@/api/inventory';
import {
  ProdBatch, ProdFormingTrolley, ProdFormingTrolleyCreate,
  FormingTotals, HotProcessBalance,
} from '@/types/production';
import { CookingLog } from '@/types/cooking-log';
import { InvLocation } from '@/types/inventory';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import Bi, { bi } from '@/components/Bi';

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
  const [cookingLogs, setCookingLogs] = useState<CookingLog[]>([]);

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
      setEditStartTime(data.start_time ? data.start_time.slice(0, 16) : '');
      setEditEndTime(data.end_time ? data.end_time.slice(0, 16) : '');
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

  const fetchCookingLogs = useCallback(async () => {
    if (!id) return;
    try {
      const res = await cookingLogsApi.list({ prod_batch_id: Number(id), limit: 100 });
      setCookingLogs(res.items);
    } catch { /* ignore */ }
  }, [id]);

  useEffect(() => { fetchBatch(); }, [fetchBatch]);

  useEffect(() => {
    if (productType === 'forming') fetchFormingTotals();
    if (productType === 'hot_process') {
      fetchHotBalance();
      fetchCookingLogs();
    }
  }, [productType, fetchFormingTotals, fetchHotBalance, fetchCookingLogs]);

  const handleSaveHeader = async () => {
    if (!batch) return;
    setHeaderSaving(true);
    try {
      const updated = await prodBatchesApi.update(batch.id, {
        start_time: editStartTime || undefined,
        end_time: editEndTime || undefined,
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
        input_weight_kg: editInputWeight ? editInputWeight : undefined,
      });
      setBatch(updated);
      await fetchHotBalance();
    } catch (err: any) {
      setError(err?.response?.data?.detail || bi('error.updateFailed'));
    } finally {
      setInputWeightSaving(false);
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

  const openEnterStockModal = async () => {
    try {
      const res = await invLocationsApi.list({ is_active: true, limit: 100 });
      setLocations(res.items);
      setSelectedLocationId(res.items[0]?.id ?? null);
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
  const canEnterStock = isHot && batch.status === 'closed' && !batch.inv_stock_doc_id;

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
            <p className="font-medium text-gray-700">{batch.start_time || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.endTime" /></p>
            <p className="font-medium text-gray-700">{batch.end_time || '—'}</p>
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
      {batch.status === 'open' && (
        <div className="card space-y-4">
          <h2 className="text-lg font-semibold text-gray-800"><Bi k="section.editBatch" /></h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label text-xs"><Bi k="field.startTime" /></label>
              <input type="datetime-local" value={editStartTime}
                onChange={(e) => setEditStartTime(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label text-xs"><Bi k="field.endTime" /></label>
              <input type="datetime-local" value={editEndTime}
                onChange={(e) => setEditEndTime(e.target.value)} className="input" />
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

      {/* ── HOT PROCESS SECTIONS ── */}
      {isHot && (
        <>
          {/* Input weight card */}
          <div className="card space-y-3">
            <h2 className="text-lg font-semibold text-gray-800"><Bi k="field.inputWeight" /></h2>
            <div className="flex items-end gap-3">
              <div className="flex-1 max-w-xs">
                <label className="label text-xs"><Bi k="field.inputWeight" /></label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={editInputWeight}
                  onChange={(e) => setEditInputWeight(e.target.value)}
                  className="input"
                  placeholder="0.000"
                />
              </div>
              <button onClick={handleSaveInputWeight} disabled={inputWeightSaving} className="btn btn-primary">
                {inputWeightSaving ? <Bi k="btn.saving" /> : <Bi k="btn.save" />}
              </button>
            </div>
          </div>

          {/* Cooking logs section */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800"><Bi k="section.cookingLogs" /></h2>
              <button
                onClick={() => navigate(`/cooking-logs/new?prod_batch_id=${batch.id}&batch_code=${encodeURIComponent(batch.batch_code)}`)}
                className="btn btn-secondary text-sm flex items-center gap-1"
              >
                <PlusIcon className="h-4 w-4" /><Bi k="btn.addCookingLog" />
              </button>
            </div>
            {cookingLogs.length === 0 ? (
              <p className="text-sm text-gray-400 italic">—</p>
            ) : (
              <div className="space-y-2">
                {cookingLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 cursor-pointer"
                    onClick={() => navigate(`/cooking-logs/${log.id}`)}
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-800">{log.batch_id}</p>
                      <p className="text-xs text-gray-500">{log.start_time.replace('T', ' ').slice(0, 16)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {log.core_temp && (
                        <span className="text-sm text-gray-600">{log.core_temp}°C</span>
                      )}
                      {log.ccp_status && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ccpColors[log.ccp_status] || ''}`}>
                          {log.ccp_status}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
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
                <button
                  type="button"
                  onClick={() => setShowTrolleyForm(!showTrolleyForm)}
                  className="btn btn-secondary text-sm flex items-center gap-1"
                >
                  <PlusIcon className="h-4 w-4" /><Bi k="btn.addTrolley" />
                </button>
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
                          <button onClick={() => handleRemoveTrolley(t.id)} className="p-1 rounded hover:bg-red-50">
                            <TrashIcon className="h-4 w-4 text-red-400" />
                          </button>
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
        <button
          onClick={() => navigate(`/production/batches/${batch.id}/packing`)}
          className="btn btn-primary"
        >
          <Bi k="btn.viewPacking" />
        </button>
        {canEnterStock && (
          <button onClick={openEnterStockModal} className="btn bg-orange-500 text-white hover:bg-orange-600">
            <Bi k="btn.enterStock" />
          </button>
        )}
        {isHot && batch.inv_stock_doc_id && (
          <button
            onClick={() => navigate(`/inventory/stock-docs/${batch.inv_stock_doc_id}`)}
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
