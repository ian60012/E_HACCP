import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { prodRepackApi, prodBatchesApi, prodProductsApi } from '@/api/production';
import {
  ProdRepackJob, ProdBatch, ProdProduct, ProdPackType,
  ProdRepackInputCreate, ProdRepackOutputCreate, ProdRepackTrimCreate,
  RepackTotals,
} from '@/types/production';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import Bi, { bi } from '@/components/Bi';

const packTypeOptions: ProdPackType[] = ['4KG_SEMI', '1KG_FG', '0.5KG_FG'];

const num = (v: any): number => (v == null ? 0 : Number(v));

export default function ProdRepackDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [job, setJob] = useState<ProdRepackJob | null>(null);
  const [closedBatches, setClosedBatches] = useState<ProdBatch[]>([]);
  const [products, setProducts] = useState<ProdProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Repack totals
  const [totals, setTotals] = useState<RepackTotals | null>(null);

  // Inline forms
  const [showInputForm, setShowInputForm] = useState(false);
  const [inputForm, setInputForm] = useState<ProdRepackInputCreate>({
    from_batch_id: undefined,
    product_id: undefined,
    bag_count: 0,
    nominal_weight_kg: 0,
  });
  const [inputSaving, setInputSaving] = useState(false);

  const [showOutputForm, setShowOutputForm] = useState(false);
  const [outputForm, setOutputForm] = useState<ProdRepackOutputCreate>({
    pack_type: '4KG_SEMI',
    product_id: undefined,
    bag_count: 0,
    nominal_weight_kg: 0,
  });
  const [outputSaving, setOutputSaving] = useState(false);

  const [showTrimForm, setShowTrimForm] = useState(false);
  const [trimForm, setTrimForm] = useState<ProdRepackTrimCreate>({
    trim_type: '',
    weight_kg: 0,
    remark: '',
  });
  const [trimSaving, setTrimSaving] = useState(false);

  const fetchJob = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const data = await prodRepackApi.get(Number(id));
      setJob(data);
    } catch {
      setError(bi('error.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchTotals = useCallback(async () => {
    if (!id) return;
    try {
      const data = await prodRepackApi.getTotals(Number(id));
      setTotals(data);
    } catch {
      // ignore
    }
  }, [id]);

  useEffect(() => { fetchJob(); }, [fetchJob]);
  useEffect(() => { fetchTotals(); }, [fetchTotals]);
  useEffect(() => {
    prodBatchesApi.list({ status: 'closed', limit: 500 }).then((r) => setClosedBatches(r.items)).catch(() => {});
    prodProductsApi.list({ limit: 500 }).then((r) => setProducts(r.items)).catch(() => {});
  }, []);

  const refreshData = async () => {
    await fetchJob();
    await fetchTotals();
  };

  // Input handlers
  const handleAddInput = async () => {
    if (!job) return;
    setInputSaving(true);
    try {
      await prodRepackApi.addInput(job.id, inputForm);
      setShowInputForm(false);
      setInputForm({ from_batch_id: undefined, product_id: undefined, bag_count: 0, nominal_weight_kg: 0 });
      await refreshData();
    } catch (err: any) {
      setError(err?.response?.data?.detail || bi('error.saveFailed'));
    } finally {
      setInputSaving(false);
    }
  };

  const handleRemoveInput = async (inputId: number) => {
    if (!job) return;
    if (!confirm(bi('confirm.deleteRow'))) return;
    try {
      await prodRepackApi.removeInput(job.id, inputId);
      await refreshData();
    } catch (err: any) {
      setError(err?.response?.data?.detail || bi('error.deleteFailed'));
    }
  };

  // Output handlers
  const handleAddOutput = async () => {
    if (!job) return;
    setOutputSaving(true);
    try {
      await prodRepackApi.addOutput(job.id, outputForm);
      setShowOutputForm(false);
      setOutputForm({ pack_type: '4KG_SEMI', product_id: undefined, bag_count: 0, nominal_weight_kg: 0 });
      await refreshData();
    } catch (err: any) {
      setError(err?.response?.data?.detail || bi('error.saveFailed'));
    } finally {
      setOutputSaving(false);
    }
  };

  const handleRemoveOutput = async (outputId: number) => {
    if (!job) return;
    if (!confirm(bi('confirm.deleteRow'))) return;
    try {
      await prodRepackApi.removeOutput(job.id, outputId);
      await refreshData();
    } catch (err: any) {
      setError(err?.response?.data?.detail || bi('error.deleteFailed'));
    }
  };

  // Trim handlers
  const handleAddTrim = async () => {
    if (!job) return;
    setTrimSaving(true);
    try {
      await prodRepackApi.addTrim(job.id, trimForm);
      setShowTrimForm(false);
      setTrimForm({ trim_type: '', weight_kg: 0, remark: '' });
      await refreshData();
    } catch (err: any) {
      setError(err?.response?.data?.detail || bi('error.saveFailed'));
    } finally {
      setTrimSaving(false);
    }
  };

  const handleRemoveTrim = async (trimId: number) => {
    if (!job) return;
    if (!confirm(bi('confirm.deleteRow'))) return;
    try {
      await prodRepackApi.removeTrim(job.id, trimId);
      await refreshData();
    } catch (err: any) {
      setError(err?.response?.data?.detail || bi('error.deleteFailed'));
    }
  };

  if (loading) return <LoadingSpinner fullPage />;
  if (error && !job) return <ErrorCard message={error} onRetry={fetchJob} />;
  if (!job) return <ErrorCard message={bi('error.loadFailed')} />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/production/repack')} className="p-2 rounded-lg hover:bg-gray-100">
          <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{job.new_batch_code}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {job.date} {job.operator && `\u00b7 ${job.operator}`}
          </p>
        </div>
      </div>

      {error && <ErrorCard message={error} />}

      {/* Info */}
      <div className="card">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.date" /></p>
            <p className="font-medium text-gray-800">{job.date}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.operator" /></p>
            <p className="font-medium text-gray-800">{job.operator || '—'}</p>
          </div>
          {job.remark && (
            <div className="sm:col-span-2">
              <p className="text-xs text-gray-400"><Bi k="field.remark" /></p>
              <p className="font-medium text-gray-700 whitespace-pre-wrap">{job.remark}</p>
            </div>
          )}
        </div>
      </div>

      {/* Inputs */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800"><Bi k="section.repackInputs" /></h2>
          <button
            type="button"
            onClick={() => setShowInputForm(!showInputForm)}
            className="btn btn-secondary text-sm flex items-center gap-1"
          >
            <PlusIcon className="h-4 w-4" /><Bi k="btn.addInput" />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="pb-2 pr-3"><Bi k="field.fromBatch" /></th>
                <th className="pb-2 pr-3"><Bi k="field.productName" /></th>
                <th className="pb-2 pr-3"><Bi k="field.bagCount" /></th>
                <th className="pb-2 pr-3"><Bi k="field.nominalWeight" /></th>
                <th className="pb-2 pr-3"><Bi k="field.totalWeight" /></th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {job.inputs.map((inp) => (
                <tr key={inp.id}>
                  <td className="py-2 pr-3 font-medium text-gray-800">{inp.from_batch_code || '—'}</td>
                  <td className="py-2 pr-3 text-gray-700">{inp.product_name || '—'}</td>
                  <td className="py-2 pr-3 text-gray-500">{inp.bag_count}</td>
                  <td className="py-2 pr-3 text-gray-500">{inp.nominal_weight_kg}</td>
                  <td className="py-2 pr-3 text-gray-500">
                    {inp.total_weight_kg != null ? `${num(inp.total_weight_kg).toFixed(2)} kg` : `${(num(inp.bag_count) * num(inp.nominal_weight_kg)).toFixed(2)} kg`}
                  </td>
                  <td className="py-2">
                    <button onClick={() => handleRemoveInput(inp.id)} className="p-1 rounded hover:bg-red-50">
                      <TrashIcon className="h-4 w-4 text-red-400" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {showInputForm && (
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700"><Bi k="section.newInput" /></h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="label text-xs"><Bi k="field.fromBatch" /></label>
                <select
                  value={inputForm.from_batch_id || ''}
                  onChange={(e) => setInputForm({ ...inputForm, from_batch_id: Number(e.target.value) || undefined })}
                  className="input"
                >
                  <option value="">{bi('placeholder.selectBatch')}</option>
                  {closedBatches.map((b) => (
                    <option key={b.id} value={b.id}>{b.batch_code} — {b.product_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label text-xs"><Bi k="field.product" /></label>
                <select
                  value={inputForm.product_id || ''}
                  onChange={(e) => setInputForm({ ...inputForm, product_id: Number(e.target.value) || undefined })}
                  className="input"
                >
                  <option value="">{bi('placeholder.selectProduct')}</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label text-xs"><Bi k="field.bagCount" /></label>
                <input
                  type="number"
                  min="1"
                  value={inputForm.bag_count || ''}
                  onChange={(e) => setInputForm({ ...inputForm, bag_count: Number(e.target.value) })}
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="label text-xs"><Bi k="field.nominalWeight" /></label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={inputForm.nominal_weight_kg || ''}
                  onChange={(e) => setInputForm({ ...inputForm, nominal_weight_kg: Number(e.target.value) })}
                  className="input"
                  required
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowInputForm(false)} className="btn btn-secondary text-sm">
                <Bi k="btn.cancel" />
              </button>
              <button type="button" onClick={handleAddInput} disabled={inputSaving} className="btn btn-primary text-sm">
                {inputSaving ? <Bi k="btn.saving" /> : <Bi k="btn.add" />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Outputs */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800"><Bi k="section.repackOutputs" /></h2>
          <button
            type="button"
            onClick={() => setShowOutputForm(!showOutputForm)}
            className="btn btn-secondary text-sm flex items-center gap-1"
          >
            <PlusIcon className="h-4 w-4" /><Bi k="btn.addOutput" />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="pb-2 pr-3"><Bi k="field.packType" /></th>
                <th className="pb-2 pr-3"><Bi k="field.productName" /></th>
                <th className="pb-2 pr-3"><Bi k="field.bagCount" /></th>
                <th className="pb-2 pr-3"><Bi k="field.nominalWeight" /></th>
                <th className="pb-2 pr-3"><Bi k="field.totalWeight" /></th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {job.outputs.map((out) => (
                <tr key={out.id}>
                  <td className="py-2 pr-3 font-medium text-gray-800">{out.pack_type}</td>
                  <td className="py-2 pr-3 text-gray-700">{out.product_name || '—'}</td>
                  <td className="py-2 pr-3 text-gray-500">{out.bag_count}</td>
                  <td className="py-2 pr-3 text-gray-500">{out.nominal_weight_kg}</td>
                  <td className="py-2 pr-3 text-gray-500">
                    {out.total_weight_kg != null ? `${num(out.total_weight_kg).toFixed(2)} kg` : `${(num(out.bag_count) * num(out.nominal_weight_kg)).toFixed(2)} kg`}
                  </td>
                  <td className="py-2">
                    <button onClick={() => handleRemoveOutput(out.id)} className="p-1 rounded hover:bg-red-50">
                      <TrashIcon className="h-4 w-4 text-red-400" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {showOutputForm && (
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700"><Bi k="section.newOutput" /></h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="label text-xs"><Bi k="field.packType" /></label>
                <select
                  value={outputForm.pack_type}
                  onChange={(e) => setOutputForm({ ...outputForm, pack_type: e.target.value as ProdPackType })}
                  className="input"
                >
                  {packTypeOptions.map((pt) => (
                    <option key={pt} value={pt}>{pt}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label text-xs"><Bi k="field.product" /></label>
                <select
                  value={outputForm.product_id || ''}
                  onChange={(e) => setOutputForm({ ...outputForm, product_id: Number(e.target.value) || undefined })}
                  className="input"
                >
                  <option value="">{bi('placeholder.selectProduct')}</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label text-xs"><Bi k="field.bagCount" /></label>
                <input
                  type="number"
                  min="1"
                  value={outputForm.bag_count || ''}
                  onChange={(e) => setOutputForm({ ...outputForm, bag_count: Number(e.target.value) })}
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="label text-xs"><Bi k="field.nominalWeight" /></label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={outputForm.nominal_weight_kg || ''}
                  onChange={(e) => setOutputForm({ ...outputForm, nominal_weight_kg: Number(e.target.value) })}
                  className="input"
                  required
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowOutputForm(false)} className="btn btn-secondary text-sm">
                <Bi k="btn.cancel" />
              </button>
              <button type="button" onClick={handleAddOutput} disabled={outputSaving} className="btn btn-primary text-sm">
                {outputSaving ? <Bi k="btn.saving" /> : <Bi k="btn.add" />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Trims */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800"><Bi k="section.trims" /></h2>
          <button
            type="button"
            onClick={() => setShowTrimForm(!showTrimForm)}
            className="btn btn-secondary text-sm flex items-center gap-1"
          >
            <PlusIcon className="h-4 w-4" /><Bi k="btn.addTrim" />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="pb-2 pr-3"><Bi k="field.trimType" /></th>
                <th className="pb-2 pr-3"><Bi k="field.weightKg" /></th>
                <th className="pb-2 pr-3"><Bi k="field.remark" /></th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {job.trims.map((trim) => (
                <tr key={trim.id}>
                  <td className="py-2 pr-3 font-medium text-gray-800">{trim.trim_type}</td>
                  <td className="py-2 pr-3 text-gray-500">{trim.weight_kg} kg</td>
                  <td className="py-2 pr-3 text-gray-400 text-xs">{trim.remark || '—'}</td>
                  <td className="py-2">
                    <button onClick={() => handleRemoveTrim(trim.id)} className="p-1 rounded hover:bg-red-50">
                      <TrashIcon className="h-4 w-4 text-red-400" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {showTrimForm && (
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700"><Bi k="section.newTrim" /></h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="label text-xs"><Bi k="field.trimType" /></label>
                <input
                  type="text"
                  value={trimForm.trim_type}
                  onChange={(e) => setTrimForm({ ...trimForm, trim_type: e.target.value })}
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="label text-xs"><Bi k="field.weightKg" /></label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={trimForm.weight_kg || ''}
                  onChange={(e) => setTrimForm({ ...trimForm, weight_kg: Number(e.target.value) })}
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="label text-xs"><Bi k="field.remark" /></label>
                <input
                  type="text"
                  value={trimForm.remark || ''}
                  onChange={(e) => setTrimForm({ ...trimForm, remark: e.target.value })}
                  className="input"
                  placeholder={bi('placeholder.remark')}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowTrimForm(false)} className="btn btn-secondary text-sm">
                <Bi k="btn.cancel" />
              </button>
              <button type="button" onClick={handleAddTrim} disabled={trimSaving} className="btn btn-primary text-sm">
                {trimSaving ? <Bi k="btn.saving" /> : <Bi k="btn.add" />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Repack Balance */}
      {totals && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-800 mb-4"><Bi k="section.repackBalance" /></h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400"><Bi k="field.inputTotal" /></p>
              <p className="text-lg font-bold text-gray-800">{num(totals.input_total_kg).toFixed(2)} kg</p>
            </div>
            <div>
              <p className="text-xs text-gray-400"><Bi k="field.outputTotal" /></p>
              <p className="text-lg font-bold text-gray-800">{num(totals.output_total_kg).toFixed(2)} kg</p>
            </div>
            <div>
              <p className="text-xs text-gray-400"><Bi k="field.totalTrim" /></p>
              <p className="text-lg font-bold text-gray-800">{num(totals.trim_total_kg).toFixed(2)} kg</p>
            </div>
            <div>
              <p className="text-xs text-gray-400"><Bi k="field.loss" /></p>
              <p className={`text-lg font-bold ${num(totals.loss_kg) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {num(totals.loss_kg).toFixed(2)} kg
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400"><Bi k="field.lossRate" /></p>
              <p className={`text-lg font-bold ${num(totals.loss_rate) > 5 ? 'text-red-600' : 'text-gray-800'}`}>
                {num(totals.loss_rate).toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button onClick={() => navigate('/production/repack')} className="btn btn-secondary">
          <Bi k="btn.back" />
        </button>
      </div>
    </div>
  );
}
