import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { receivingLogsApi } from '@/api/receiving-logs';
import { suppliersApi } from '@/api/suppliers';
import { ReceivingLog, ReceivingLogCreate, ReceivingLogUpdate, QUANTITY_UNITS } from '@/types/receiving-log';
import { Supplier } from '@/types/supplier';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import FormField from '@/components/FormField';
import CCPIndicator from '@/components/CCPIndicator';
import Bi, { bi } from '@/components/Bi';
import { useAuth } from '@/hooks/useAuth';

export default function ReceivingLogFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const isEdit = Boolean(id);

  // Pre-fill params from 原料管理 page
  const prefilledInvItemId = searchParams.get('inv_item_id') ? Number(searchParams.get('inv_item_id')) : undefined;
  const prefilledInvItemName = searchParams.get('inv_item_name') || '';
  const prefilledSupplierId = searchParams.get('supplier_id') ? Number(searchParams.get('supplier_id')) : 0;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  // Form state
  const [supplierId, setSupplierId] = useState<number>(prefilledSupplierId);
  const [poNumber, setPoNumber] = useState('');
  const [productName, setProductName] = useState(prefilledInvItemName);
  const [quantity, setQuantity] = useState('');
  const [quantityUnit, setQuantityUnit] = useState<string>(QUANTITY_UNITS[0]);
  const [tempChilled, setTempChilled] = useState('');
  const [tempFrozen, setTempFrozen] = useState('');
  const [vehicleCleanliness, setVehicleCleanliness] = useState<'Pass' | 'Fail'>('Pass');
  const [packagingIntegrity, setPackagingIntegrity] = useState<'Pass' | 'Fail'>('Pass');
  const [acceptanceStatus, setAcceptanceStatus] = useState<'Accept' | 'Reject' | 'Hold'>('Accept');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [notes, setNotes] = useState('');

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const suppliersRes = await suppliersApi.list(0, 200);
        setSuppliers(suppliersRes.items.filter((s) => s.is_active));

        if (isEdit && id) {
          const log = await receivingLogsApi.get(Number(id));
          populateForm(log);
        }
      } catch {
        setError('無法載入資料');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [id, isEdit]);

  const populateForm = (log: ReceivingLog) => {
    setSupplierId(log.supplier_id);
    setPoNumber(log.po_number || '');
    setProductName(log.product_name || '');
    setQuantity(log.quantity || '');
    setQuantityUnit(log.quantity_unit || QUANTITY_UNITS[0]);
    setTempChilled(log.temp_chilled || '');
    setTempFrozen(log.temp_frozen || '');
    setVehicleCleanliness(log.vehicle_cleanliness);
    setPackagingIntegrity(log.packaging_integrity);
    setAcceptanceStatus(log.acceptance_status);
    setCorrectiveAction(log.corrective_action || '');
    setNotes(log.notes || '');
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!isEdit && !supplierId) {
      newErrors.supplierId = '請選擇供應商';
    }

    if (!isEdit && !productName.trim()) {
      newErrors.productName = '請輸入產品名稱';
    }

    if (acceptanceStatus !== 'Accept' && !correctiveAction.trim()) {
      newErrors.correctiveAction = '非接受狀態時，必須填寫矯正措施';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    setError('');
    try {
      if (isEdit && id) {
        const updateData: ReceivingLogUpdate = {
          acceptance_status: acceptanceStatus,
          corrective_action: correctiveAction || undefined,
          notes: notes || undefined,
        };
        await receivingLogsApi.update(Number(id), updateData);
        navigate(`/receiving-logs/${id}`);
      } else {
        const createData: ReceivingLogCreate = {
          supplier_id: supplierId,
          po_number: poNumber || undefined,
          product_name: productName || undefined,
          quantity: quantity || undefined,
          quantity_unit: quantity ? quantityUnit : undefined,
          temp_chilled: tempChilled || undefined,
          temp_frozen: tempFrozen || undefined,
          vehicle_cleanliness: vehicleCleanliness,
          packaging_integrity: packagingIntegrity,
          acceptance_status: acceptanceStatus,
          corrective_action: correctiveAction || undefined,
          notes: notes || undefined,
          inv_item_id: prefilledInvItemId,
        };
        const created = await receivingLogsApi.create(createData);
        navigate(`/receiving-logs/${created.id}`);
      }
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || (isEdit ? '更新失敗' : '建立失敗'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner fullPage />;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(isEdit ? `/receiving-logs/${id}` : '/receiving-logs')}
          className="p-2 rounded-lg hover:bg-gray-100"
        >
          <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            {isEdit ? <Bi k="page.receiving.edit" /> : <Bi k="page.receiving.new" />}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">FSP-LOG-001 原料收貨檢查</p>
          <p className="text-sm text-gray-500">記錄人 Operator: <span className="font-medium text-gray-700">{user?.full_name}</span></p>
          {prefilledInvItemName && (
            <p className="text-sm text-blue-600 mt-0.5">品項：{prefilledInvItemName}</p>
          )}
        </div>
      </div>

      {error && <ErrorCard message={error} />}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Supplier & PO */}
        <div className="card space-y-4">
          <h2 className="text-lg font-semibold text-gray-800"><Bi k="section.receivingInfo" /></h2>

          <FormField label={<Bi k="field.supplier" />} required error={errors.supplierId}>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(Number(e.target.value))}
              className="input"
              disabled={isEdit}
            >
              <option value={0}>請選擇供應商</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label={<Bi k="field.poNumber" />}>
            <input
              type="text"
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
              className="input"
              placeholder="PO-2024-001"
              disabled={isEdit}
            />
          </FormField>

          <FormField label={<Bi k="field.productName" />} required error={errors.productName}>
            <input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              className="input"
              placeholder="例：雞胸肉、牛奶"
              disabled={isEdit}
              required
            />
          </FormField>

          <FormField label={<Bi k="field.receivingQuantity" />}>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.001"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="input flex-1"
                placeholder="例：10.5"
                disabled={isEdit}
              />
              <select
                value={quantityUnit}
                onChange={(e) => setQuantityUnit(e.target.value)}
                className="input w-24"
                disabled={isEdit}
              >
                {QUANTITY_UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </FormField>
        </div>

        {/* Temperature */}
        <div className="card space-y-4">
          <h2 className="text-lg font-semibold text-gray-800"><Bi k="section.tempCheck" /></h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label={<Bi k="field.tempChilledUnit" />} hint={bi('misc.ccpStandard5')}>
              <input
                type="number"
                step="0.1"
                value={tempChilled}
                onChange={(e) => setTempChilled(e.target.value)}
                className="input"
                placeholder="例：3.5"
                disabled={isEdit}
              />
            </FormField>

            <FormField label={<Bi k="field.tempFrozenUnit" />} hint={bi('misc.ccpStandard18')}>
              <input
                type="number"
                step="0.1"
                value={tempFrozen}
                onChange={(e) => setTempFrozen(e.target.value)}
                className="input"
                placeholder="例：-20.0"
                disabled={isEdit}
              />
            </FormField>
          </div>

          {/* CCP Indicators */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CCPIndicator
              value={tempChilled}
              limit={5}
              unit="°C"
              mode="lte"
              label="冷藏溫度"
            />
            <CCPIndicator
              value={tempFrozen}
              limit={-18}
              unit="°C"
              mode="lte"
              label="冷凍溫度"
            />
          </div>
        </div>

        {/* Inspection */}
        <div className="card space-y-4">
          <h2 className="text-lg font-semibold text-gray-800"><Bi k="section.inspection" /></h2>

          <FormField label={<Bi k="field.vehicleCleanliness" />} required>
            <div className="flex items-center gap-6 mt-1">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="vehicleCleanliness"
                  value="Pass"
                  checked={vehicleCleanliness === 'Pass'}
                  onChange={() => setVehicleCleanliness('Pass')}
                  className="text-primary-600"
                  disabled={isEdit}
                />
                <span className="text-sm text-gray-700"><Bi k="status.pass" /></span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="vehicleCleanliness"
                  value="Fail"
                  checked={vehicleCleanliness === 'Fail'}
                  onChange={() => setVehicleCleanliness('Fail')}
                  className="text-red-600"
                  disabled={isEdit}
                />
                <span className="text-sm text-gray-700"><Bi k="status.fail" /></span>
              </label>
            </div>
          </FormField>

          <FormField label={<Bi k="field.packagingIntegrity" />} required>
            <div className="flex items-center gap-6 mt-1">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="packagingIntegrity"
                  value="Pass"
                  checked={packagingIntegrity === 'Pass'}
                  onChange={() => setPackagingIntegrity('Pass')}
                  className="text-primary-600"
                  disabled={isEdit}
                />
                <span className="text-sm text-gray-700"><Bi k="status.pass" /></span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="packagingIntegrity"
                  value="Fail"
                  checked={packagingIntegrity === 'Fail'}
                  onChange={() => setPackagingIntegrity('Fail')}
                  className="text-red-600"
                  disabled={isEdit}
                />
                <span className="text-sm text-gray-700"><Bi k="status.fail" /></span>
              </label>
            </div>
          </FormField>
        </div>

        {/* Acceptance */}
        <div className="card space-y-4">
          <h2 className="text-lg font-semibold text-gray-800"><Bi k="section.result" /></h2>

          <FormField label={<Bi k="field.acceptanceStatus" />} required>
            <select
              value={acceptanceStatus}
              onChange={(e) =>
                setAcceptanceStatus(e.target.value as 'Accept' | 'Reject' | 'Hold')
              }
              className="input"
            >
              <option value="Accept">{bi('status.accept')}</option>
              <option value="Reject">{bi('status.reject')}</option>
              <option value="Hold">{bi('status.hold')}</option>
            </select>
          </FormField>

          {acceptanceStatus !== 'Accept' && (
            <FormField
              label={<Bi k="field.correctiveAction" />}
              required
              error={errors.correctiveAction}
            >
              <textarea
                value={correctiveAction}
                onChange={(e) => setCorrectiveAction(e.target.value)}
                className="input min-h-[100px]"
                placeholder="請描述採取的矯正措施..."
              />
            </FormField>
          )}

          {acceptanceStatus === 'Accept' && (
            <FormField label={<Bi k="field.correctiveAction" />}>
              <textarea
                value={correctiveAction}
                onChange={(e) => setCorrectiveAction(e.target.value)}
                className="input min-h-[80px]"
                placeholder="如有需要，請描述矯正措施..."
              />
            </FormField>
          )}
        </div>

        {/* Notes */}
        <div className="card space-y-4">
          <FormField label={<Bi k="field.notes" />}>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input min-h-[80px]"
              placeholder="其他備註資訊..."
            />
          </FormField>
        </div>

        {/* Submit */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="btn btn-primary"
          >
            {saving ? <Bi k="btn.saving" /> : isEdit ? <Bi k="btn.updateRecord" /> : <Bi k="btn.createRecord" />}
          </button>
          <button
            type="button"
            onClick={() =>
              navigate(isEdit ? `/receiving-logs/${id}` : '/receiving-logs')
            }
            className="btn btn-secondary"
          >
            <Bi k="btn.cancel" />
          </button>
        </div>
      </form>
    </div>
  );
}
