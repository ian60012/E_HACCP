import { useState, useEffect } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { prodBatchesApi, prodProductsApi } from '@/api/production';
import { FormingOption, ProdProductType, ProdShift } from '@/types/production';
import FormField from '@/components/FormField';
import ErrorCard from '@/components/ErrorCard';
import Bi, { bi } from '@/components/Bi';
import DateTimeInput from '@/components/DateTimeInput';
import SignaturePad from '@/components/SignaturePad';
import { melbourneToUTC, nowMelbourne } from '@/utils/timezone';
import { useAuth } from '@/hooks/useAuth';

function todayStr() {
  return nowMelbourne().slice(0, 10);
}

export default function ProdBatchFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const requestedType = searchParams.get('type');
  const typeFilter: ProdProductType | null = requestedType === 'forming' || requestedType === 'hot_process' || requestedType === 'meat_processing'
    ? requestedType
    : null;
  const backTo = typeFilter === 'meat_processing' ? '/production/meat' : `/production/batches?type=${typeFilter}`;

  const [formingOptions, setFormingOptions] = useState<FormingOption[]>([]);
  const [productCode, setProductCode] = useState('');
  const [productName, setProductName] = useState('');
  const [selectedProductType, setSelectedProductType] = useState<ProdProductType>(typeFilter || 'forming');
  const [productionDate, setProductionDate] = useState(todayStr());
  const [shift, setShift] = useState<ProdShift>('Morning');
  const [specPieceWeightG, setSpecPieceWeightG] = useState('17.5');
  const [startTime, setStartTime] = useState('');
  const [operator, setOperator] = useState(user?.full_name || '');
  const [operatorSignature, setOperatorSignature] = useState('');
  const [supervisor, setSupervisor] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!typeFilter) return;
    setProductCode('');
    setProductName('');
    setSelectedProductType(typeFilter);
    prodProductsApi.formingOptions(typeFilter).then(setFormingOptions).catch(() => setFormingOptions([]));
  }, [typeFilter]);

  const handleOptionChange = (code: string) => {
    setProductCode(code);
    const opt = formingOptions.find((o) => o.code === code);
    setProductName(opt?.name || '');
    setSelectedProductType(opt?.product_type || typeFilter || 'forming');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productCode) {
      setError(bi('error.required'));
      return;
    }
    const selected = formingOptions.find((option) => option.code === productCode);
    if (!typeFilter || selected?.product_type !== typeFilter) {
      setError('所選產品不屬於目前生產分類 Selected product does not belong to this production category');
      return;
    }
    if (!operatorSignature) {
      setError('請先完成手寫簽名 Signature is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const batch = await prodBatchesApi.create({
        process_type: typeFilter,
        product_code: productCode,
        product_name: productName,
        production_date: productionDate,
        shift,
        spec_piece_weight_g: selectedProductType === "forming" ? Number(specPieceWeightG) : 0,
        start_time: startTime ? melbourneToUTC(startTime) : undefined,
        operator: operator || undefined,
        operator_signature_data_url: operatorSignature,
        supervisor: supervisor || undefined,
      });
      navigate(typeFilter === 'meat_processing' ? `/production/meat/${batch.id}` : `/production/batches/${batch.id}`);
    } catch (err: any) {
      setError(err?.response?.data?.detail || bi('error.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (!typeFilter) return <Navigate to="/production" replace />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(backTo)} className="p-2 rounded-lg hover:bg-gray-100">
          <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            {typeFilter === 'forming'
              ? <Bi k="page.forming.new" />
              : typeFilter === 'hot_process'
              ? <Bi k="page.hotProcess.new" />
              : typeFilter === 'meat_processing' ? <Bi k="page.meat.new" /> : <Bi k="page.prodBatchNew.title" />}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">記錄人 Operator: <span className="font-medium text-gray-700">{user?.full_name}</span></p>
          <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
            typeFilter === 'hot_process'
              ? 'bg-orange-100 text-orange-800 ring-orange-300'
              : typeFilter === 'meat_processing'
                ? 'bg-violet-100 text-violet-800 ring-violet-300'
                : 'bg-blue-100 text-blue-800 ring-blue-300'
          }`}>
            {typeFilter === 'hot_process' ? bi('label.hotProcess') : typeFilter === 'meat_processing' ? bi('label.meatProcessing') : bi('label.forming')}
          </span>
        </div>
      </div>

      {error && <ErrorCard message={error} />}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label={<Bi k="field.productCode" />} required>
              <select
                value={productCode}
                onChange={(e) => handleOptionChange(e.target.value)}
                className="input"
                required
              >
                <option value="">{bi('placeholder.selectProduct')}</option>
                {formingOptions.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.code} — {opt.name} {opt.product_type === 'meat_processing' ? `[${bi('label.meatProcessing')}]` : opt.product_type === 'hot_process' ? `[${bi('label.hotProcess')}]` : `[${bi('label.forming')}]`}
                  </option>
                ))}
              </select>
              {formingOptions.length === 0 && (
                <p className="mt-1 text-sm text-amber-700">此分類尚無可用產品 No active products in this category</p>
              )}
            </FormField>
            <FormField label={<Bi k="field.productName" />}>
              <input type="text" value={productName} readOnly className="input bg-gray-50" />
            </FormField>
            <FormField label={<Bi k="field.productionDate" />} required>
              <input
                type="date"
                value={productionDate}
                onChange={(e) => setProductionDate(e.target.value)}
                className="input"
                required
              />
            </FormField>
            <FormField label={<Bi k="field.shift" />}>
              <select value={shift} onChange={(e) => setShift(e.target.value as ProdShift)} className="input">
                <option value="Morning">{bi('label.morning')}</option>
                <option value="Night">{bi('label.night')}</option>
              </select>
            </FormField>
            {selectedProductType === 'forming' && (
              <FormField label={<Bi k="field.specPieceWeight" />}>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={specPieceWeightG}
                  onChange={(e) => setSpecPieceWeightG(e.target.value)}
                  className="input"
                />
              </FormField>
            )}
            <FormField label={<Bi k="field.startTime" />}>
              <DateTimeInput value={startTime} onChange={setStartTime} copyDateFrom={productionDate} />
            </FormField>
            <FormField label={<Bi k="field.operator" />}>
              <input
                type="text"
                value={operator}
                onChange={(e) => setOperator(e.target.value)}
                className="input"
                placeholder={bi('placeholder.operator')}
              />
            </FormField>
            <FormField label={<Bi k="field.supervisor" />}>
              <input
                type="text"
                value={supervisor}
                onChange={(e) => setSupervisor(e.target.value)}
                className="input"
                placeholder={bi('placeholder.supervisor')}
              />
            </FormField>
          </div>
        </div>

        <div className="card">
          <SignaturePad
            value={operatorSignature}
            onChange={setOperatorSignature}
            required
            error={!operatorSignature && error.includes('Signature') ? error : undefined}
          />
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => navigate(backTo)} className="btn btn-secondary">
            <Bi k="btn.cancel" />
          </button>
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? <Bi k="btn.saving" /> : <Bi k="btn.create" />}
          </button>
        </div>
      </form>
    </div>
  );
}
