import { useState, useEffect, useCallback, useMemo, FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { assemblyLogsApi } from '@/api/assembly-logs';
import { productsApi } from '@/api/products';
import { AssemblyLog, AssemblyLogCreate, AssemblyLogUpdate } from '@/types/assembly-log';
import { Product } from '@/types/product';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import FormField from '@/components/FormField';
import Bi, { bi } from '@/components/Bi';

export default function AssemblyLogFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [products, setProducts] = useState<Product[]>([]);

  // Form fields
  const [batchId, setBatchId] = useState('');
  const [productId, setProductId] = useState<number | ''>('');
  const [isAllergenDeclared, setIsAllergenDeclared] = useState(false);
  const [isDateCodeCorrect, setIsDateCodeCorrect] = useState(false);
  const [targetWeightG, setTargetWeightG] = useState('');
  const [sample1, setSample1] = useState('');
  const [sample2, setSample2] = useState('');
  const [sample3, setSample3] = useState('');
  const [sample4, setSample4] = useState('');
  const [sample5, setSample5] = useState('');
  const [sealIntegrity, setSealIntegrity] = useState<'Pass' | 'Fail' | ''>('');
  const [codingLegibility, setCodingLegibility] = useState<'Pass' | 'Fail' | ''>('');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [notes, setNotes] = useState('');

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Calculate real-time average
  const averageWeight = useMemo(() => {
    const samples = [sample1, sample2, sample3, sample4, sample5]
      .filter((s) => s !== '' && !isNaN(parseFloat(s)))
      .map(parseFloat);
    if (samples.length === 0) return null;
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    return Math.round(avg * 100) / 100;
  }, [sample1, sample2, sample3, sample4, sample5]);

  // Fetch products and optionally existing log
  const fetchData = useCallback(async () => {
    setFetchLoading(true);
    try {
      const [productsRes] = await Promise.all([
        productsApi.list(0, 100),
      ]);
      setProducts(productsRes.items.filter((p) => p.is_active));

      if (isEdit && id) {
        const data = await assemblyLogsApi.get(Number(id));
        setBatchId(data.batch_id);
        setProductId(data.product_id);
        setIsAllergenDeclared(data.is_allergen_declared);
        setIsDateCodeCorrect(data.is_date_code_correct ?? false);
        setTargetWeightG(data.target_weight_g || '');
        setSample1(data.sample_1_g || '');
        setSample2(data.sample_2_g || '');
        setSample3(data.sample_3_g || '');
        setSample4(data.sample_4_g || '');
        setSample5(data.sample_5_g || '');
        setSealIntegrity(data.seal_integrity || '');
        setCodingLegibility(data.coding_legibility || '');
        setCorrectiveAction(data.corrective_action || '');
        setNotes(data.notes || '');
      }
    } catch {
      setError('無法載入資料');
    } finally {
      setFetchLoading(false);
    }
  }, [id, isEdit]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function validate(): boolean {
    const errs: Record<string, string> = {};

    if (!batchId.trim()) errs.batchId = '請輸入批次編號';
    if (!productId) errs.productId = '請選擇產品';

    // Validate sample weights (if entered, must be valid numbers)
    const sampleFields = [
      { key: 'sample1', val: sample1 },
      { key: 'sample2', val: sample2 },
      { key: 'sample3', val: sample3 },
      { key: 'sample4', val: sample4 },
      { key: 'sample5', val: sample5 },
    ];
    for (const { key, val } of sampleFields) {
      if (val && isNaN(parseFloat(val))) {
        errs[key] = '重量格式無效';
      }
    }

    if (targetWeightG && isNaN(parseFloat(targetWeightG))) {
      errs.targetWeightG = '重量格式無效';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setSubmitError('');

    try {
      if (isEdit && id) {
        const updateData: AssemblyLogUpdate = {
          is_allergen_declared: isAllergenDeclared,
          is_date_code_correct: isDateCodeCorrect,
          target_weight_g: targetWeightG || undefined,
          sample_1_g: sample1 || undefined,
          sample_2_g: sample2 || undefined,
          sample_3_g: sample3 || undefined,
          sample_4_g: sample4 || undefined,
          sample_5_g: sample5 || undefined,
          seal_integrity: sealIntegrity || undefined,
          coding_legibility: codingLegibility || undefined,
          corrective_action: correctiveAction || undefined,
          notes: notes || undefined,
        };
        await assemblyLogsApi.update(Number(id), updateData);
        navigate(`/assembly-logs/${id}`);
      } else {
        const createData: AssemblyLogCreate = {
          batch_id: batchId.trim(),
          product_id: productId as number,
          is_allergen_declared: isAllergenDeclared,
          is_date_code_correct: isDateCodeCorrect,
          target_weight_g: targetWeightG || undefined,
          sample_1_g: sample1 || undefined,
          sample_2_g: sample2 || undefined,
          sample_3_g: sample3 || undefined,
          sample_4_g: sample4 || undefined,
          sample_5_g: sample5 || undefined,
          seal_integrity: sealIntegrity || undefined,
          coding_legibility: codingLegibility || undefined,
          corrective_action: correctiveAction || undefined,
          notes: notes || undefined,
        };
        const created = await assemblyLogsApi.create(createData);
        navigate(`/assembly-logs/${created.id}`);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail;
      setSubmitError(typeof msg === 'string' ? msg : '儲存失敗，請重試');
    } finally {
      setLoading(false);
    }
  }

  if (fetchLoading) return <LoadingSpinner fullPage />;
  if (error) return <ErrorCard message={error} />;

  const sampleInputs = [
    { label: `${bi('misc.sample')} 1`, value: sample1, setter: setSample1, key: 'sample1' },
    { label: `${bi('misc.sample')} 2`, value: sample2, setter: setSample2, key: 'sample2' },
    { label: `${bi('misc.sample')} 3`, value: sample3, setter: setSample3, key: 'sample3' },
    { label: `${bi('misc.sample')} 4`, value: sample4, setter: setSample4, key: 'sample4' },
    { label: `${bi('misc.sample')} 5`, value: sample5, setter: setSample5, key: 'sample5' },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to={isEdit ? `/assembly-logs/${id}` : '/assembly-logs'} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            {isEdit ? <Bi k="page.assembly.edit" /> : <Bi k="page.assembly.new" />}
          </h1>
          <p className="text-sm text-gray-500">FSP-LOG-006 組裝包裝品質監控</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-800 mb-4"><Bi k="section.basicInfo" /></h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label={<Bi k="field.batchId" />} required error={errors.batchId}>
              <input
                type="text"
                value={batchId}
                onChange={(e) => setBatchId(e.target.value)}
                disabled={isEdit}
                className="input"
                placeholder="例：ASM-20240115-001"
              />
            </FormField>

            <FormField label={<Bi k="field.product" />} required error={errors.productId}>
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value ? Number(e.target.value) : '')}
                disabled={isEdit}
                className="input"
              >
                <option value="">請選擇產品</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </FormField>
          </div>
        </div>

        {/* Declarations */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-800 mb-4"><Bi k="section.labelCheck" /></h2>
          <div className="space-y-3">
            <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={isAllergenDeclared}
                onChange={(e) => setIsAllergenDeclared(e.target.checked)}
                className="rounded border-gray-300 h-5 w-5 text-blue-600"
              />
              <div>
                <p className="font-medium text-gray-700"><Bi k="field.allergenMarked" /></p>
                <p className="text-xs text-gray-400">確認產品包裝上已正確標示所有過敏原資訊</p>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={isDateCodeCorrect}
                onChange={(e) => setIsDateCodeCorrect(e.target.checked)}
                className="rounded border-gray-300 h-5 w-5 text-blue-600"
              />
              <div>
                <p className="font-medium text-gray-700"><Bi k="field.dateCodeMarked" /></p>
                <p className="text-xs text-gray-400">確認包裝上的生產日期和有效日期正確無誤</p>
              </div>
            </label>
          </div>
        </div>

        {/* Weight Sampling */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-800 mb-4"><Bi k="section.weightSampling" /></h2>

          <div className="mb-4">
            <FormField label={<Bi k="field.targetWeight" />} error={errors.targetWeightG}>
              <input
                type="number"
                step="0.01"
                value={targetWeightG}
                onChange={(e) => setTargetWeightG(e.target.value)}
                className="input"
                placeholder="例：250.00"
              />
            </FormField>
          </div>

          {/* 5 sample weight inputs in a grid */}
          <div className="grid grid-cols-5 gap-2">
            {sampleInputs.map((s) => (
              <FormField key={s.key} label={s.label} error={errors[s.key]}>
                <input
                  type="number"
                  step="0.01"
                  value={s.value}
                  onChange={(e) => s.setter(e.target.value)}
                  className="input text-center"
                  placeholder="g"
                />
              </FormField>
            ))}
          </div>

          {/* Real-time average display */}
          <div className="mt-4 p-4 bg-gray-50 rounded-lg text-center">
            <p className="text-xs text-gray-400 mb-1"><Bi k="field.realtimeAvgWeight" /></p>
            <p className={`text-2xl font-bold ${
              averageWeight !== null
                ? targetWeightG && Math.abs(averageWeight - parseFloat(targetWeightG)) > parseFloat(targetWeightG) * 0.1
                  ? 'text-red-600'
                  : 'text-green-600'
                : 'text-gray-300'
            }`}>
              {averageWeight !== null ? `${averageWeight} g` : '—'}
            </p>
            {averageWeight !== null && targetWeightG && (
              <p className="text-xs text-gray-500 mt-1">
                與目標差異: {(averageWeight - parseFloat(targetWeightG)).toFixed(2)} g
                ({((averageWeight - parseFloat(targetWeightG)) / parseFloat(targetWeightG) * 100).toFixed(1)}%)
              </p>
            )}
          </div>
        </div>

        {/* Quality Checks */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-800 mb-4"><Bi k="section.qualityCheck" /></h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <FormField label={<Bi k="field.sealIntegrity" />}>
              <div className="flex items-center gap-4 mt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="sealIntegrity"
                    checked={sealIntegrity === 'Pass'}
                    onChange={() => setSealIntegrity('Pass')}
                    className="text-green-600"
                  />
                  <span className="text-sm text-green-700 font-medium"><Bi k="status.pass" /></span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="sealIntegrity"
                    checked={sealIntegrity === 'Fail'}
                    onChange={() => setSealIntegrity('Fail')}
                    className="text-red-600"
                  />
                  <span className="text-sm text-red-700 font-medium"><Bi k="status.fail" /></span>
                </label>
                {sealIntegrity && (
                  <button
                    type="button"
                    onClick={() => setSealIntegrity('')}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    清除
                  </button>
                )}
              </div>
            </FormField>

            <FormField label="編碼清晰度">
              <div className="flex items-center gap-4 mt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="codingLegibility"
                    checked={codingLegibility === 'Pass'}
                    onChange={() => setCodingLegibility('Pass')}
                    className="text-green-600"
                  />
                  <span className="text-sm text-green-700 font-medium">通過</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="codingLegibility"
                    checked={codingLegibility === 'Fail'}
                    onChange={() => setCodingLegibility('Fail')}
                    className="text-red-600"
                  />
                  <span className="text-sm text-red-700 font-medium">失敗</span>
                </label>
                {codingLegibility && (
                  <button
                    type="button"
                    onClick={() => setCodingLegibility('')}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    清除
                  </button>
                )}
              </div>
            </FormField>
          </div>
        </div>

        {/* Corrective Action & Notes */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">附加資訊</h2>
          <div className="space-y-4">
            <FormField label="矯正措施" hint="如有偏差請說明矯正措施">
              <textarea
                value={correctiveAction}
                onChange={(e) => setCorrectiveAction(e.target.value)}
                className="input"
                rows={3}
                placeholder="例：重量偏差過大，已重新調整包裝機..."
              />
            </FormField>

            <FormField label="備註">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input"
                rows={2}
                placeholder="其他備註..."
              />
            </FormField>
          </div>
        </div>

        {/* Submit */}
        {submitError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {submitError}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={loading} className="btn btn-primary flex-1 sm:flex-none">
            {loading ? '儲存中...' : isEdit ? '更新記錄' : '建立記錄'}
          </button>
          <Link to={isEdit ? `/assembly-logs/${id}` : '/assembly-logs'} className="btn btn-secondary">
            取消
          </Link>
        </div>
      </form>
    </div>
  );
}
