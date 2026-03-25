import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { prodBatchesApi, prodProductsApi } from '@/api/production';
import { FormingOption, ProdShift } from '@/types/production';
import FormField from '@/components/FormField';
import ErrorCard from '@/components/ErrorCard';
import Bi, { bi } from '@/components/Bi';
import DateTimeInput from '@/components/DateTimeInput';
import { melbourneToUTC } from '@/utils/timezone';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function ProdBatchFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const typeFilter = searchParams.get('type') as 'forming' | 'hot_process' | null;
  const backTo = typeFilter ? `/production/batches?type=${typeFilter}` : '/production/batches';

  const [formingOptions, setFormingOptions] = useState<FormingOption[]>([]);
  const [productCode, setProductCode] = useState('');
  const [productName, setProductName] = useState('');
  const [selectedProductType, setSelectedProductType] = useState<string>(typeFilter || 'forming');
  const [productionDate, setProductionDate] = useState(todayStr());
  const [shift, setShift] = useState<ProdShift>('Morning');
  const [specPieceWeightG, setSpecPieceWeightG] = useState('17.5');
  const [startTime, setStartTime] = useState('');
  const [operator, setOperator] = useState('');
  const [supervisor, setSupervisor] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    prodProductsApi.formingOptions().then((opts) => {
      // Filter options by type if a type filter is active
      if (typeFilter) {
        setFormingOptions(opts.filter((o) => o.product_type === typeFilter));
      } else {
        setFormingOptions(opts);
      }
    }).catch(() => {});
  }, [typeFilter]);

  const handleOptionChange = (code: string) => {
    setProductCode(code);
    const opt = formingOptions.find((o) => o.code === code);
    setProductName(opt?.name || '');
    setSelectedProductType(opt?.product_type || 'forming');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productCode) {
      setError(bi('error.required'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const batch = await prodBatchesApi.create({
        product_code: productCode,
        product_name: productName,
        production_date: productionDate,
        shift,
        spec_piece_weight_g: Number(specPieceWeightG),
        start_time: startTime ? melbourneToUTC(startTime) : undefined,
        operator: operator || undefined,
        supervisor: supervisor || undefined,
      });
      navigate(`/production/batches/${batch.id}`);
    } catch (err: any) {
      setError(err?.response?.data?.detail || bi('error.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(backTo)} className="p-2 rounded-lg hover:bg-gray-100">
          <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
        </button>
        <h1 className="text-2xl font-bold text-gray-800">
          {typeFilter === 'forming'
            ? <Bi k="page.forming.new" />
            : typeFilter === 'hot_process'
            ? <Bi k="page.hotProcess.new" />
            : <Bi k="page.prodBatchNew.title" />}
        </h1>
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
                    {opt.code} — {opt.name} {opt.product_type === 'hot_process' ? `[${bi('label.hotProcess')}]` : `[${bi('label.forming')}]`}
                  </option>
                ))}
              </select>
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
            {selectedProductType !== 'hot_process' && (
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
