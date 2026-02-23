import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { cookingLogsApi } from '@/api/cooking-logs';
import { productsApi } from '@/api/products';
import { equipmentApi } from '@/api/equipment';
import { Product } from '@/types/product';
import { Equipment } from '@/types/equipment';
import { CookingLog } from '@/types/cooking-log';
import FormField from '@/components/FormField';
import CCPIndicator from '@/components/CCPIndicator';
import LoadingSpinner from '@/components/LoadingSpinner';
import Bi, { bi } from '@/components/Bi';

export default function CookingLogFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [products, setProducts] = useState<Product[]>([]);
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [existingLog, setExistingLog] = useState<CookingLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [batchId, setBatchId] = useState('');
  const [productId, setProductId] = useState<number | ''>('');
  const [equipmentId, setEquipmentId] = useState<number | ''>('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [coreTemp, setCoreTemp] = useState('');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [notes, setNotes] = useState('');

  const selectedProduct = products.find(p => p.id === productId);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [prodRes, equipRes] = await Promise.all([
          productsApi.list(0, 200),
          equipmentApi.list(0, 200),
        ]);
        setProducts(prodRes.items.filter(p => p.is_active));
        setEquipmentList(equipRes.items.filter(e => e.is_active));

        if (isEdit) {
          const log = await cookingLogsApi.get(Number(id));
          setExistingLog(log);
          setBatchId(log.batch_id);
          setProductId(log.product_id);
          setEquipmentId(log.equipment_id || '');
          setStartTime(log.start_time ? log.start_time.slice(0, 16) : '');
          setEndTime(log.end_time ? log.end_time.slice(0, 16) : '');
          setCoreTemp(log.core_temp || '');
          setCorrectiveAction(log.corrective_action || '');
          setNotes(log.notes || '');
        } else {
          // Defaults for new record
          const now = new Date();
          setStartTime(now.toISOString().slice(0, 16));
        }
      } catch {
        setError('無法載入資料');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [id, isEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      if (isEdit) {
        await cookingLogsApi.update(Number(id), {
          end_time: endTime || undefined,
          core_temp: coreTemp || undefined,
          corrective_action: correctiveAction || undefined,
          notes: notes || undefined,
        });
        navigate(`/cooking-logs/${id}`);
      } else {
        const created = await cookingLogsApi.create({
          batch_id: batchId,
          product_id: Number(productId),
          equipment_id: equipmentId ? Number(equipmentId) : undefined,
          start_time: new Date(startTime).toISOString(),
          end_time: endTime ? new Date(endTime).toISOString() : undefined,
          core_temp: coreTemp || undefined,
          corrective_action: correctiveAction || undefined,
          notes: notes || undefined,
        });
        navigate(`/cooking-logs/${created.id}`);
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
        <Link to={isEdit ? `/cooking-logs/${id}` : '/cooking-logs'} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">
          {isEdit ? <Bi k="page.cooking.edit" /> : <Bi k="page.cooking.new" />}
        </h1>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {isEdit && existingLog?.is_locked && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
          此記錄已鎖定，無法編輯。
        </div>
      )}

      <form onSubmit={handleSubmit} className="card space-y-4">
        <FormField label={<Bi k="field.batchId" />} required>
          <input type="text" value={batchId} onChange={(e) => setBatchId(e.target.value)}
            className="input" placeholder="例如：BATCH-2026-001" required disabled={isEdit} maxLength={50} />
        </FormField>

        <FormField label={<Bi k="field.product" />} required>
          <select value={productId} onChange={(e) => setProductId(e.target.value ? Number(e.target.value) : '')}
            className="input" required disabled={isEdit}>
            <option value="">請選擇產品</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>{p.name} (CCP: {p.ccp_limit_temp}°C)</option>
            ))}
          </select>
        </FormField>

        <FormField label={<Bi k="field.equipment" />}>
          <select value={equipmentId} onChange={(e) => setEquipmentId(e.target.value ? Number(e.target.value) : '')}
            className="input">
            <option value="">無</option>
            {equipmentList.map(e => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </FormField>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label={<Bi k="field.startTime" />} required>
            <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)}
              className="input" required disabled={isEdit} />
          </FormField>
          <FormField label={<Bi k="field.endTime" />}>
            <input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)}
              className="input" min={startTime} />
          </FormField>
        </div>

        <FormField label={<Bi k="field.coreTempUnit" />} hint={bi('misc.foodCenterTemp')}>
          <input type="number" value={coreTemp} onChange={(e) => setCoreTemp(e.target.value)}
            className="input" step="0.1" min="0" max="250" placeholder="例如：75.5" />
        </FormField>

        {/* Real-time CCP indicator */}
        {selectedProduct && coreTemp && (
          <CCPIndicator value={coreTemp} limit={selectedProduct.ccp_limit_temp} label="烹飪CCP" />
        )}

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
          <Link to={isEdit ? `/cooking-logs/${id}` : '/cooking-logs'} className="btn btn-secondary">
            <Bi k="btn.cancel" />
          </Link>
        </div>
      </form>
    </div>
  );
}
