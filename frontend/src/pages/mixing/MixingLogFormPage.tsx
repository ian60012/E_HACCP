import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { mixingLogsApi } from '@/api/mixing-logs';
import { prodProductsApi, prodBatchesApi } from '@/api/production';
import { ProdProduct, ProdBatch } from '@/types/production';
import { MixingLog } from '@/types/mixing-log';
import FormField from '@/components/FormField';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import Bi, { bi } from '@/components/Bi';
import DateTimeInput from '@/components/DateTimeInput';
import { toMelbourneInput, nowMelbourne, melbourneToUTC } from '@/utils/timezone';
import { useAuth } from '@/hooks/useAuth';

function toLocalInput(iso: string): string { return toMelbourneInput(iso); }
function nowLocalISO(): string { return nowMelbourne(); }

export default function MixingLogFormPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isEdit = !!id;

  const [products, setProducts] = useState<ProdProduct[]>([]);
  const [openBatches, setOpenBatches] = useState<ProdBatch[]>([]);
  const [existingLog, setExistingLog] = useState<MixingLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [batchId, setBatchId] = useState('');
  const [prodProductId, setProdProductId] = useState<number | ''>('');
  const [prodBatchId, setProdBatchId] = useState<number | ''>('');
  const [weightKg, setWeightKg] = useState('');
  const [initialTemp, setInitialTemp] = useState('');
  const [finalTemp, setFinalTemp] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [visualCheck, setVisualCheck] = useState(false);
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [notes, setNotes] = useState('');

  const selectedProduct = products.find(p => p.id === prodProductId);

  useEffect(() => {
    const loadData = async () => {
      try {
        const paramProdBatchId = searchParams.get('prod_batch_id');
        const [prodRes, batchRes, linkedBatchRes] = await Promise.all([
          prodProductsApi.list({ limit: 200 }),
          isEdit ? Promise.resolve(null) : prodBatchesApi.list({ status: 'open', limit: 100 }),
          !isEdit && paramProdBatchId ? prodBatchesApi.get(Number(paramProdBatchId)).catch(() => null) : Promise.resolve(null),
        ]);
        // Only forming products for mixing
        setProducts(prodRes.items.filter(p => p.is_active && p.product_type === 'forming'));
        const batches = batchRes ? [...batchRes.items] : [];
        if (linkedBatchRes && !batches.find(b => b.id === linkedBatchRes.id)) {
          batches.push(linkedBatchRes);
        }
        setOpenBatches(batches);

        if (isEdit) {
          const log = await mixingLogsApi.get(Number(id));
          setExistingLog(log);
          setBatchId(log.batch_id);
          setProdProductId(log.prod_product_id ?? '');
          setProdBatchId(log.prod_batch_id ?? '');
          setWeightKg(log.weight_kg != null ? String(log.weight_kg) : '');
          setInitialTemp(log.initial_temp != null ? String(log.initial_temp) : '');
          setFinalTemp(log.final_temp != null ? String(log.final_temp) : '');
          setStartTime(log.start_time ? toLocalInput(log.start_time) : '');
          setEndTime(log.end_time ? toLocalInput(log.end_time) : '');
          setVisualCheck(log.visual_check ?? false);
          setCorrectiveAction(log.corrective_action || '');
          setNotes(log.notes || '');
        } else {
          setStartTime(nowLocalISO());
          if (paramProdBatchId) {
            setProdBatchId(Number(paramProdBatchId));
          }
          // Auto-match product from URL params
          const paramProductName = searchParams.get('product_name');
          if (paramProductName) {
            const matched = prodRes.items.find(p => p.is_active && p.name === paramProductName);
            if (matched) setProdProductId(matched.id);
          } else if (paramProdBatchId) {
            const linkedBatch = batches.find(b => b.id === Number(paramProdBatchId));
            if (linkedBatch) {
              const matched = prodRes.items.find(p => p.is_active && p.name === linkedBatch.product_name);
              if (matched) setProdProductId(matched.id);
            }
          }
          const paramBatchCode = searchParams.get('batch_code');
          if (paramBatchCode) setBatchId(paramBatchCode);
          const paramStartTime = searchParams.get('start_time');
          if (paramStartTime) setStartTime(toLocalInput(paramStartTime));
        }
      } catch {
        setError('無法載入資料');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [id, isEdit, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      if (isEdit) {
        await mixingLogsApi.update(Number(id), {
          weight_kg: weightKg ? Number(weightKg) : undefined,
          initial_temp: initialTemp ? Number(initialTemp) : undefined,
          final_temp: finalTemp ? Number(finalTemp) : undefined,
          end_time: endTime ? melbourneToUTC(endTime) : undefined,
          visual_check: visualCheck,
          corrective_action: correctiveAction || undefined,
          notes: notes || undefined,
        });
        navigate(`/mixing-logs/${id}`);
      } else {
        const created = await mixingLogsApi.create({
          batch_id: batchId,
          prod_product_id: prodProductId ? Number(prodProductId) : undefined,
          prod_batch_id: prodBatchId ? Number(prodBatchId) : undefined,
          weight_kg: weightKg ? Number(weightKg) : undefined,
          initial_temp: initialTemp ? Number(initialTemp) : undefined,
          final_temp: finalTemp ? Number(finalTemp) : undefined,
          start_time: melbourneToUTC(startTime),
          end_time: endTime ? melbourneToUTC(endTime) : undefined,
          visual_check: visualCheck,
          corrective_action: correctiveAction || undefined,
          notes: notes || undefined,
        });
        const returnToBatch = searchParams.get('prod_batch_id');
        if (returnToBatch) {
          navigate(`/production/batches/${returnToBatch}`);
        } else {
          navigate(`/mixing-logs/${created.id}`);
        }
      }
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || '儲存失敗');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner fullPage />;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Link to={isEdit ? `/mixing-logs/${id}` : searchParams.get('prod_batch_id') ? `/production/batches/${searchParams.get('prod_batch_id')}` : '/mixing-logs'} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            {isEdit ? <Bi k="page.mixing.edit" /> : <Bi k="page.mixing.new" />}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">記錄人 Operator: <span className="font-medium text-gray-700">{user?.full_name}</span></p>
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      {isEdit && existingLog?.is_locked && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
          此記錄已鎖定，無法編輯。
        </div>
      )}

      {/* Product name banner */}
      {selectedProduct && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
          <span className="text-blue-600 font-medium">產品 Product:</span>{' '}
          <span className="text-blue-800 font-semibold">{selectedProduct.code} — {selectedProduct.name}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="card space-y-4">
        <FormField label={<Bi k="field.batchId" />} required>
          <input type="text" value={batchId} onChange={(e) => setBatchId(e.target.value)}
            className="input" placeholder="例如：BATCH-2026-001" required disabled={isEdit} maxLength={50} />
        </FormField>

        <FormField label={<Bi k="field.product" />} required>
          <select value={prodProductId} onChange={(e) => setProdProductId(e.target.value ? Number(e.target.value) : '')}
            className="input" required disabled={isEdit}>
            <option value="">請選擇產品</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
            ))}
          </select>
        </FormField>

        {!isEdit && (
          <FormField label={<Bi k="field.prodBatch" />}>
            <select value={prodBatchId} onChange={(e) => setProdBatchId(e.target.value ? Number(e.target.value) : '')}
              className="input">
              <option value="">— {bi('placeholder.selectBatch')} —</option>
              {openBatches.map(b => (
                <option key={b.id} value={b.id}>{b.batch_code} · {b.product_name}</option>
              ))}
            </select>
          </FormField>
        )}
        {isEdit && existingLog?.prod_batch_id && (
          <FormField label={<Bi k="field.prodBatch" />}>
            <p className="text-sm text-gray-700 py-2">
              <Link to={`/production/batches/${existingLog.prod_batch_id}`} className="text-blue-600 hover:underline">
                #{existingLog.prod_batch_id}
              </Link>
            </p>
          </FormField>
        )}

        <FormField label={<Bi k="field.weightKg" />}>
          <input type="number" value={weightKg} onChange={(e) => setWeightKg(e.target.value)}
            className="input" step="0.001" min="0" placeholder="例如：150.5" />
        </FormField>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label={<Bi k="field.initialTemp" />}>
            <input type="number" value={initialTemp} onChange={(e) => setInitialTemp(e.target.value)}
              className="input" step="0.1" placeholder="°C" />
          </FormField>
          <FormField label={<Bi k="field.finalTemp" />}>
            <input type="number" value={finalTemp} onChange={(e) => setFinalTemp(e.target.value)}
              className="input" step="0.1" placeholder="°C" />
          </FormField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label={<Bi k="field.startTime" />} required>
            <DateTimeInput value={startTime} onChange={setStartTime} required disabled={isEdit} />
          </FormField>
          <FormField label={<Bi k="field.endTime" />}>
            <DateTimeInput value={endTime} onChange={setEndTime} min={startTime} copyDateFrom={startTime} />
          </FormField>
        </div>

        <FormField label={<Bi k="field.visualCheck" />}>
          <div className="flex gap-2">
            <button type="button"
              onClick={() => setVisualCheck(true)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${visualCheck ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
            >Yes</button>
            <button type="button"
              onClick={() => setVisualCheck(false)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${!visualCheck ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
            >No</button>
          </div>
        </FormField>

        <FormField label={<Bi k="field.correctiveAction" />}>
          <textarea value={correctiveAction} onChange={(e) => setCorrectiveAction(e.target.value)}
            className="input min-h-[60px]" placeholder="如有偏差請填寫矯正措施" />
        </FormField>

        <FormField label={<Bi k="field.notes" />}>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
            className="input min-h-[60px]" placeholder="其他備註" />
        </FormField>

        <div className="flex items-center gap-3 pt-4 border-t">
          <button type="submit" disabled={submitting || (isEdit && existingLog?.is_locked)}
            className="btn btn-primary flex-1 sm:flex-none">
            {submitting ? <Bi k="btn.saving" /> : isEdit ? <Bi k="btn.updateRecord" /> : <Bi k="btn.createRecord" />}
          </button>
          <Link to={isEdit ? `/mixing-logs/${id}` : searchParams.get('prod_batch_id') ? `/production/batches/${searchParams.get('prod_batch_id')}` : '/mixing-logs'} className="btn btn-secondary">
            <Bi k="btn.cancel" />
          </Link>
        </div>
      </form>
    </div>
  );
}
