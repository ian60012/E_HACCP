import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, PlusIcon, TrashIcon, PencilIcon } from '@heroicons/react/24/outline';
import { prodBatchesApi, prodProductsApi, packTypesApi } from '@/api/production';
import { invItemsApi } from '@/api/inventory';
import {
  ProdBatch, ProdProduct, ProdPackType,
  ProdPackingRecordCreate, ProdPackingTrimCreate, PackTypeConfig,
} from '@/types/production';
import { InvItem } from '@/types/inventory';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import Bi, { bi } from '@/components/Bi';

const num = (v: any): number => (v == null ? 0 : Number(v));

interface LocalPackRecord {
  pack_type: ProdPackType;
  product_id: number | '';
  inv_item_id: number | '';
  bag_count: string;
  nominal_weight_kg: string;
  remark: string;
}

interface LocalTrim {
  trim_type: string;
  weight_kg: string;
  remark: string;
}

function lossRateClass(rate: number, warnPct: number | null): string {
  const threshold = warnPct ?? 5;
  return rate > threshold ? 'text-red-600' : 'text-gray-800';
}

export default function ProdPackingPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [batch, setBatch] = useState<ProdBatch | null>(null);
  const [products, setProducts] = useState<ProdProduct[]>([]);
  const [packTypeConfigs, setPackTypeConfigs] = useState<PackTypeConfig[]>([]);
  const [invItems, setInvItems] = useState<InvItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Local editable state
  const [records, setRecords] = useState<LocalPackRecord[]>([]);
  const [trims, setTrims] = useState<LocalTrim[]>([]);
  const [editing, setEditing] = useState(false);

  const fetchBatch = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const data = await prodBatchesApi.get(Number(id));
      setBatch(data);
      if (data.packing_records.length > 0) {
        setRecords(
          data.packing_records.map((r) => ({
            pack_type: r.pack_type,
            product_id: r.product_id || '',
            inv_item_id: r.inv_item_id || '',
            bag_count: String(r.bag_count),
            nominal_weight_kg: String(r.nominal_weight_kg),
            remark: r.remark || '',
          }))
        );
      }
      if (data.packing_trims.length > 0) {
        setTrims(
          data.packing_trims.map((t) => ({
            trim_type: t.trim_type,
            weight_kg: String(t.weight_kg),
            remark: t.remark || '',
          }))
        );
      }
    } catch {
      setError(bi('error.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchBatch(); }, [fetchBatch]);
  useEffect(() => {
    prodProductsApi.list({ limit: 500 }).then((r) => setProducts(r.items)).catch(() => {});
    invItemsApi.list({ is_active: true, limit: 500 }).then((r) => setInvItems(r.items)).catch(() => {});
  }, []);

  // Determine product type from the matched product
  const matchedProduct = batch ? products.find((p) => p.code === batch.product_code) : null;
  const isHotProcess = matchedProduct?.product_type === 'hot_process';
  const packSizeKg = matchedProduct?.pack_size_kg ?? null;
  const lossRateWarnPct = matchedProduct?.loss_rate_warn_pct ?? null;

  // Fetch pack types once we know the product type
  useEffect(() => {
    if (!batch || products.length === 0) return;
    const applicableType = isHotProcess ? 'hot_process' : 'forming';
    packTypesApi.list({ applicable_type: applicableType }).then(setPackTypeConfigs).catch(() => {});
  }, [isHotProcess, batch?.id, products.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-add initial row for hot_process when products load and no records exist
  useEffect(() => {
    if (isHotProcess && records.length === 0 && batch && batch.status === 'open') {
      const defaultPackType = (packTypeConfigs[0]?.code || 'BULK_KG') as ProdPackType;
      setRecords([{
        pack_type: defaultPackType,
        product_id: matchedProduct?.id || '',
        inv_item_id: '',
        bag_count: '',
        nominal_weight_kg: packSizeKg != null ? String(packSizeKg) : '',
        remark: '',
      }]);
    }
  }, [isHotProcess, packSizeKg, matchedProduct?.id, packTypeConfigs.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Record helpers
  const defaultProductId = matchedProduct?.id || '';
  const addRecord = () => {
    if (isHotProcess) {
      const defaultPackType = (packTypeConfigs[0]?.code || 'BULK_KG') as ProdPackType;
      setRecords((prev) => [
        ...prev,
        { pack_type: defaultPackType, product_id: defaultProductId, inv_item_id: '', bag_count: '', nominal_weight_kg: packSizeKg != null ? String(packSizeKg) : '', remark: '' },
      ]);
    } else {
      const defaultPackType = (packTypeConfigs[0]?.code || '4KG_SEMI') as ProdPackType;
      setRecords((prev) => [
        ...prev,
        { pack_type: defaultPackType, product_id: defaultProductId, inv_item_id: '', bag_count: '', nominal_weight_kg: '', remark: '' },
      ]);
    }
  };
  const removeRecord = (index: number) => {
    setRecords((prev) => prev.filter((_, i) => i !== index));
  };
  const updateRecord = (index: number, field: keyof LocalPackRecord, value: string | number) => {
    setRecords((prev) => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  };

  // Trim helpers (forming only)
  const addTrim = () => {
    setTrims((prev) => [...prev, { trim_type: '', weight_kg: '', remark: '' }]);
  };
  const removeTrim = (index: number) => {
    setTrims((prev) => prev.filter((_, i) => i !== index));
  };
  const updateTrim = (index: number, field: keyof LocalTrim, value: string) => {
    setTrims((prev) => prev.map((t, i) => i === index ? { ...t, [field]: value } : t));
  };

  // Material balance — forming
  const formingInput = num(batch?.estimated_forming_net_weight_kg);
  const total4kg = records
    .filter((r) => r.pack_type === '4KG_SEMI')
    .reduce((sum, r) => sum + (Number(r.bag_count) || 0) * (Number(r.nominal_weight_kg) || 0), 0);
  const totalRetail = records
    .filter((r) => r.pack_type !== '4KG_SEMI')
    .reduce((sum, r) => sum + (Number(r.bag_count) || 0) * (Number(r.nominal_weight_kg) || 0), 0);
  const totalTrim = trims.reduce((sum, t) => sum + (Number(t.weight_kg) || 0), 0);
  const formingOutputTotal = total4kg + totalRetail + totalTrim;
  const formingLoss = formingInput - formingOutputTotal;
  const formingLossRate = formingInput > 0 ? (formingLoss / formingInput) * 100 : 0;

  // Material balance — hot process
  const hotInput = num(batch?.input_weight_kg);
  const hotPacked = records.reduce(
    (sum, r) => sum + (Number(r.bag_count) || 0) * (Number(r.nominal_weight_kg) || 0),
    0
  );
  const hotLoss = hotInput > 0 ? hotInput - hotPacked : null;
  const hotLossRate = hotInput > 0 ? ((hotInput - hotPacked) / hotInput) * 100 : null;

  const handleSave = async () => {
    if (!batch) return;
    if (!confirm(bi('confirm.saveCloseBatch'))) return;

    const validRecords: ProdPackingRecordCreate[] = records
      .filter((r) => r.bag_count && r.nominal_weight_kg)
      .map((r) => ({
        pack_type: r.pack_type,
        product_id: r.product_id ? Number(r.product_id) : undefined,
        inv_item_id: r.inv_item_id ? Number(r.inv_item_id) : undefined,
        bag_count: Number(r.bag_count),
        nominal_weight_kg: Number(r.nominal_weight_kg),
        remark: r.remark || undefined,
      }));

    const validTrims: ProdPackingTrimCreate[] = trims
      .filter((t) => t.trim_type && t.weight_kg)
      .map((t) => ({
        trim_type: t.trim_type,
        weight_kg: Number(t.weight_kg),
        remark: t.remark || undefined,
      }));

    setSaving(true);
    setError('');
    try {
      const updated = await prodBatchesApi.savePacking(batch.id, {
        records: validRecords,
        trims: validTrims,
      });
      setBatch(updated);
      setEditing(false);
    } catch (err: any) {
      setError(err?.response?.data?.detail || bi('error.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner fullPage />;
  if (error && !batch) return <ErrorCard message={error} onRetry={fetchBatch} />;
  if (!batch) return <ErrorCard message={bi('error.loadFailed')} />;

  const isPacked = batch.status === 'packed';
  const isClosed = batch.status === 'closed';
  const isReadOnly = isClosed || (isPacked && !editing);

  // ── Hot process layout ──────────────────────────────────────────────────
  if (isHotProcess) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(`/production/batches/${batch.id}`)} className="p-2 rounded-lg hover:bg-gray-100">
              <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">
                <Bi k="page.packing.title" /> — {batch.batch_code}
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {batch.product_name}
                {packSizeKg != null && <> &middot; <Bi k="field.packSizeKg" />: {packSizeKg} kg</>}
              </p>
            </div>
          </div>
          {isPacked && !editing && (
            <button onClick={() => setEditing(true)} className="btn btn-secondary flex items-center gap-1.5">
              <PencilIcon className="h-4 w-4" /> 編輯 Edit
            </button>
          )}
        </div>

        {error && <ErrorCard message={error} />}

        {/* Packing Records — hot process */}
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800"><Bi k="section.packingRecords" /></h2>
            {!isReadOnly && (
              <button type="button" onClick={addRecord} className="btn btn-secondary text-sm flex items-center gap-1">
                <PlusIcon className="h-4 w-4" /><Bi k="btn.addRecord" />
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="pb-2 pr-3"><Bi k="field.packType" /></th>
                  <th className="pb-2 pr-3">庫存品項</th>
                  <th className="pb-2 pr-3"><Bi k="field.nominalWeight" /></th>
                  <th className="pb-2 pr-3"><Bi k="field.bagCount" /></th>
                  <th className="pb-2 pr-3"><Bi k="field.theoreticalTotal" /></th>
                  <th className="pb-2 pr-3"><Bi k="field.remark" /></th>
                  {!isReadOnly && <th className="pb-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {records.map((rec, index) => {
                  const theoretical = (Number(rec.bag_count) || 0) * (Number(rec.nominal_weight_kg) || 0);
                  return (
                    <tr key={index}>
                      <td className="py-2 pr-3">
                        {isReadOnly ? (
                          <span className="text-gray-700">
                            {packTypeConfigs.find((c) => c.code === rec.pack_type)?.name || rec.pack_type}
                          </span>
                        ) : (
                          <select
                            value={rec.pack_type}
                            onChange={(e) => updateRecord(index, 'pack_type', e.target.value)}
                            className="input w-auto"
                          >
                            {packTypeConfigs.map((pt) => (
                              <option key={pt.code} value={pt.code}>{pt.name}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {isReadOnly ? (
                          <span className="text-gray-700 text-xs">
                            {invItems.find((i) => i.id === Number(rec.inv_item_id))?.name || '—'}
                          </span>
                        ) : (
                          <select
                            value={rec.inv_item_id}
                            onChange={(e) => updateRecord(index, 'inv_item_id', Number(e.target.value) || '')}
                            className="input w-auto text-xs"
                          >
                            <option value="">— 未指定 —</option>
                            {invItems.map((item) => (
                              <option key={item.id} value={item.id}>{item.code} — {item.name}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {isReadOnly ? (
                          <span className="text-gray-700">{rec.nominal_weight_kg} kg</span>
                        ) : (
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            value={rec.nominal_weight_kg}
                            onChange={(e) => updateRecord(index, 'nominal_weight_kg', e.target.value)}
                            className="input w-28"
                          />
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {isReadOnly ? (
                          <span className="text-gray-700">{rec.bag_count}</span>
                        ) : (
                          <input
                            type="number"
                            min="0"
                            value={rec.bag_count}
                            onChange={(e) => updateRecord(index, 'bag_count', e.target.value)}
                            className="input w-20"
                          />
                        )}
                      </td>
                      <td className="py-2 pr-3 text-gray-500">{theoretical.toFixed(3)} kg</td>
                      <td className="py-2 pr-3">
                        {isReadOnly ? (
                          <span className="text-gray-400 text-xs">{rec.remark || '—'}</span>
                        ) : (
                          <input
                            type="text"
                            value={rec.remark}
                            onChange={(e) => updateRecord(index, 'remark', e.target.value)}
                            className="input w-32"
                            placeholder={bi('placeholder.remark')}
                          />
                        )}
                      </td>
                      {!isReadOnly && (
                        <td className="py-2">
                          <button onClick={() => removeRecord(index)} className="p-1 rounded hover:bg-red-50">
                            <TrashIcon className="h-4 w-4 text-red-400" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Material Balance — hot process */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-800 mb-4"><Bi k="section.hotProcessBalance" /></h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400"><Bi k="field.inputWeight" /></p>
              <p className="text-lg font-bold text-gray-800">
                {hotInput > 0 ? `${hotInput.toFixed(3)} kg` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400"><Bi k="field.packedWeight" /></p>
              <p className="text-lg font-bold text-gray-800">{hotPacked.toFixed(3)} kg</p>
            </div>
            <div>
              <p className="text-xs text-gray-400"><Bi k="field.lossWeight" /></p>
              <p className={`text-lg font-bold ${hotLoss != null && hotLoss > 0 ? 'text-red-600' : 'text-gray-800'}`}>
                {hotLoss != null ? `${hotLoss.toFixed(3)} kg` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400"><Bi k="field.lossRate" /></p>
              <p className={`text-lg font-bold ${hotLossRate != null ? lossRateClass(hotLossRate, lossRateWarnPct) : 'text-gray-800'}`}>
                {hotLossRate != null ? `${hotLossRate.toFixed(1)}%` : '—'}
                {lossRateWarnPct != null && (
                  <span className="text-xs text-gray-400 font-normal ml-1">(閾值 {lossRateWarnPct}%)</span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(`/production/batches/${batch.id}`)} className="btn btn-secondary">
            <Bi k="btn.back" />
          </button>
          {editing && (
            <button onClick={() => { setEditing(false); fetchBatch(); }} className="btn btn-secondary">
              取消 Cancel
            </button>
          )}
          {!isReadOnly && (
            <button onClick={handleSave} disabled={saving} className="btn btn-primary">
              {saving ? <Bi k="btn.saving" /> : <Bi k="btn.saveCloseBatch" />}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Forming layout (original) ────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/production/batches/${batch.id}`)} className="p-2 rounded-lg hover:bg-gray-100">
            <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              <Bi k="page.packing.title" /> — {batch.batch_code}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {batch.product_name} &middot; <Bi k="field.formingNet" />: {formingInput.toFixed(2)} kg
            </p>
          </div>
        </div>
        {isPacked && !editing && (
          <button onClick={() => setEditing(true)} className="btn btn-secondary flex items-center gap-1.5">
            <PencilIcon className="h-4 w-4" /> 編輯 Edit
          </button>
        )}
      </div>

      {error && <ErrorCard message={error} />}

      {/* Packing Records */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800"><Bi k="section.packingRecords" /></h2>
          {!isReadOnly && (
            <button type="button" onClick={addRecord} className="btn btn-secondary text-sm flex items-center gap-1">
              <PlusIcon className="h-4 w-4" /><Bi k="btn.addRecord" />
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="pb-2 pr-3"><Bi k="field.packType" /></th>
                <th className="pb-2 pr-3">庫存品項</th>
                <th className="pb-2 pr-3"><Bi k="field.bagCount" /></th>
                <th className="pb-2 pr-3"><Bi k="field.nominalWeight" /></th>
                <th className="pb-2 pr-3"><Bi k="field.theoreticalTotal" /></th>
                <th className="pb-2 pr-3"><Bi k="field.remark" /></th>
                {!isReadOnly && <th className="pb-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {records.map((rec, index) => {
                const theoretical = (Number(rec.bag_count) || 0) * (Number(rec.nominal_weight_kg) || 0);
                return (
                  <tr key={index}>
                    <td className="py-2 pr-3">
                      {isReadOnly ? (
                        <span className="text-gray-700">
                          {packTypeConfigs.find((c) => c.code === rec.pack_type)?.name || rec.pack_type}
                        </span>
                      ) : (
                        <select
                          value={rec.pack_type}
                          onChange={(e) => updateRecord(index, 'pack_type', e.target.value)}
                          className="input w-auto"
                        >
                          {packTypeConfigs.map((pt) => (
                            <option key={pt.code} value={pt.code}>{pt.name}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {isReadOnly ? (
                        <span className="text-gray-700 text-xs">
                          {invItems.find((i) => i.id === Number(rec.inv_item_id))?.name || '—'}
                        </span>
                      ) : (
                        <select
                          value={rec.inv_item_id}
                          onChange={(e) => updateRecord(index, 'inv_item_id', Number(e.target.value) || '')}
                          className="input w-auto text-xs"
                        >
                          <option value="">— 未指定 —</option>
                          {invItems.map((item) => (
                            <option key={item.id} value={item.id}>{item.code} — {item.name}</option>
                          ))}
                        </select>
                      )}
                    </td>

                    <td className="py-2 pr-3">
                      {isReadOnly ? (
                        <span className="text-gray-700">{rec.bag_count}</span>
                      ) : (
                        <input
                          type="number"
                          min="0"
                          value={rec.bag_count}
                          onChange={(e) => updateRecord(index, 'bag_count', e.target.value)}
                          className="input w-20"
                        />
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {isReadOnly ? (
                        <span className="text-gray-700">{rec.nominal_weight_kg}</span>
                      ) : (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={rec.nominal_weight_kg}
                          onChange={(e) => updateRecord(index, 'nominal_weight_kg', e.target.value)}
                          className="input w-24"
                        />
                      )}
                    </td>
                    <td className="py-2 pr-3 text-gray-500">{theoretical.toFixed(2)} kg</td>
                    <td className="py-2 pr-3">
                      {isReadOnly ? (
                        <span className="text-gray-400 text-xs">{rec.remark || '—'}</span>
                      ) : (
                        <input
                          type="text"
                          value={rec.remark}
                          onChange={(e) => updateRecord(index, 'remark', e.target.value)}
                          className="input w-32"
                          placeholder={bi('placeholder.remark')}
                        />
                      )}
                    </td>
                    {!isReadOnly && (
                      <td className="py-2">
                        <button onClick={() => removeRecord(index)} className="p-1 rounded hover:bg-red-50">
                          <TrashIcon className="h-4 w-4 text-red-400" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Trims */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800"><Bi k="section.trims" /></h2>
          {!isReadOnly && (
            <button type="button" onClick={addTrim} className="btn btn-secondary text-sm flex items-center gap-1">
              <PlusIcon className="h-4 w-4" /><Bi k="btn.addTrim" />
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="pb-2 pr-3"><Bi k="field.trimType" /></th>
                <th className="pb-2 pr-3"><Bi k="field.weightKg" /></th>
                <th className="pb-2 pr-3"><Bi k="field.remark" /></th>
                {!isReadOnly && <th className="pb-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {trims.map((trim, index) => (
                <tr key={index}>
                  <td className="py-2 pr-3">
                    {isReadOnly ? (
                      <span className="text-gray-700">{trim.trim_type}</span>
                    ) : (
                      <input
                        type="text"
                        value={trim.trim_type}
                        onChange={(e) => updateTrim(index, 'trim_type', e.target.value)}
                        className="input w-32"
                      />
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {isReadOnly ? (
                      <span className="text-gray-700">{trim.weight_kg}</span>
                    ) : (
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={trim.weight_kg}
                        onChange={(e) => updateTrim(index, 'weight_kg', e.target.value)}
                        className="input w-24"
                      />
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {isReadOnly ? (
                      <span className="text-gray-400 text-xs">{trim.remark || '—'}</span>
                    ) : (
                      <input
                        type="text"
                        value={trim.remark}
                        onChange={(e) => updateTrim(index, 'remark', e.target.value)}
                        className="input w-32"
                        placeholder={bi('placeholder.remark')}
                      />
                    )}
                  </td>
                  {!isReadOnly && (
                    <td className="py-2">
                      <button onClick={() => removeTrim(index)} className="p-1 rounded hover:bg-red-50">
                        <TrashIcon className="h-4 w-4 text-red-400" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Material Balance */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-800 mb-4"><Bi k="section.materialBalance" /></h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.formingInput" /></p>
            <p className="text-lg font-bold text-gray-800">{formingInput.toFixed(2)} kg</p>
          </div>
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.total4kg" /></p>
            <p className="text-lg font-bold text-gray-800">{total4kg.toFixed(2)} kg</p>
          </div>
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.totalRetail" /></p>
            <p className="text-lg font-bold text-gray-800">{totalRetail.toFixed(2)} kg</p>
          </div>
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.totalTrim" /></p>
            <p className="text-lg font-bold text-gray-800">{totalTrim.toFixed(2)} kg</p>
          </div>
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.outputTotal" /></p>
            <p className="text-lg font-bold text-gray-800">{formingOutputTotal.toFixed(2)} kg</p>
          </div>
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.loss" /></p>
            <p className={`text-lg font-bold ${formingLoss > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formingLoss.toFixed(2)} kg
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.lossRate" /></p>
            <p className={`text-lg font-bold ${lossRateClass(formingLossRate, lossRateWarnPct)}`}>
              {formingLossRate.toFixed(1)}%
              {lossRateWarnPct != null && (
                <span className="text-xs text-gray-400 font-normal ml-1">(閾值 {lossRateWarnPct}%)</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(`/production/batches/${batch.id}`)} className="btn btn-secondary">
          <Bi k="btn.back" />
        </button>
        {editing && (
          <button onClick={() => { setEditing(false); fetchBatch(); }} className="btn btn-secondary">
            取消 Cancel
          </button>
        )}
        {!isReadOnly && (
          <button onClick={handleSave} disabled={saving} className="btn btn-primary">
            {saving ? <Bi k="btn.saving" /> : <Bi k="btn.saveCloseBatch" />}
          </button>
        )}
      </div>
    </div>
  );
}
