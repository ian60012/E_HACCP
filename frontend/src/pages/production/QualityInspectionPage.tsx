import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeftIcon, CameraIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { prepareQualityPhoto, qualityControlApi, qualityError } from '@/api/qualityControl';
import ErrorCard from '@/components/ErrorCard';
import LoadingSpinner from '@/components/LoadingSpinner';
import QualityStatusBadge from '@/components/QualityStatusBadge';
import SignaturePad from '@/components/SignaturePad';
import { QualityInspection, QualityInspectionContext, QualityInspectionSave, QualityResult, StorageCondition } from '@/types/qualityControl';

const emptyForm: QualityInspectionSave = { retained_sample: null };

function localDateTime(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value); const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function isoDateTime(value?: string | null): string | null { return value ? new Date(value).toISOString() : null; }

function toForm(record: QualityInspection | null): QualityInspectionSave {
  if (!record) return { ...emptyForm, inspection_at: localDateTime(new Date().toISOString()) };
  return {
    inspection_at: localDateTime(record.inspection_at), color_result: record.color_result,
    aroma_result: record.aroma_result, taste_result: record.taste_result,
    not_applicable_reason: record.not_applicable_reason, notes: record.notes,
    corrective_action: record.corrective_action, retained_sample: record.retained_sample,
    no_sample_reason: record.no_sample_reason, sample_code: record.sample_code,
    sample_quantity: record.sample_quantity, sample_unit: record.sample_unit,
    sampled_at: localDateTime(record.sampled_at), storage_condition: record.storage_condition,
    storage_location: record.storage_location, disposal_due_date: record.disposal_due_date,
  };
}

function payload(form: QualityInspectionSave): QualityInspectionSave {
  return { ...form, inspection_at: isoDateTime(form.inspection_at), sampled_at: isoDateTime(form.sampled_at) };
}

const resultOptions: { value: QualityResult; label: string }[] = [
  { value: 'pass', label: '合格 Pass' }, { value: 'fail', label: '不合格 Fail' }, { value: 'not_applicable', label: '不适用 N/A' },
];

function SensoryField({ id, label, value, disabled, onChange }: { id: string; label: string; value?: QualityResult | null; disabled: boolean; onChange: (value: QualityResult) => void }) {
  return <fieldset className="rounded-xl border border-gray-200 p-4" disabled={disabled}>
    <legend className="px-1 text-sm font-semibold text-gray-800">{label}</legend>
    <div className="mt-2 grid gap-2 sm:grid-cols-3">{resultOptions.map((option) => <label key={option.value} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${value === option.value ? 'border-primary-500 bg-primary-50' : 'border-gray-200'}`}>
      <input id={`${id}-${option.value}`} type="radio" name={id} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />{option.label}
    </label>)}</div>
  </fieldset>;
}

export default function QualityInspectionPage() {
  const batchId = Number(useParams().id);
  const [context, setContext] = useState<QualityInspectionContext | null>(null);
  const [form, setForm] = useState<QualityInspectionSave>(emptyForm);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [signature, setSignature] = useState('');
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const [error, setError] = useState(''); const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await qualityControlApi.get(batchId); setContext(data); setForm(toForm(data.inspection)); setPhoto(null);
      if (data.inspection?.has_photo) {
        const blob = await qualityControlApi.getPhoto(batchId); setPhotoUrl((previous) => { if (previous) URL.revokeObjectURL(previous); return URL.createObjectURL(blob); });
      } else setPhotoUrl((previous) => { if (previous) URL.revokeObjectURL(previous); return ''; });
    } catch (caught) { setError(qualityError(caught)); } finally { setLoading(false); }
  }, [batchId]);

  useEffect(() => { load(); return () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }; }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const record = context?.inspection; const editable = Boolean(context?.permissions.can_edit && !context.is_voided && (!record || record.status === 'draft'));
  const signable = Boolean(context?.permissions.can_verify && !context.is_voided && record?.status === 'draft');
  const hasNA = [form.color_result, form.aroma_result, form.taste_result].includes('not_applicable');
  const hasFailure = [form.color_result, form.aroma_result, form.taste_result].includes('fail');
  const backTo = context?.process_type === 'meat_processing' ? `/production/meat/${batchId}` : `/production/batches/${batchId}`;

  const saveDraft = async (): Promise<QualityInspection> => {
    const saved = await qualityControlApi.save(batchId, payload(form)); let result = saved;
    if (photo) { const prepared = await prepareQualityPhoto(photo); result = await qualityControlApi.uploadPhoto(batchId, prepared); }
    return result;
  };

  const perform = async (action: () => Promise<void>) => {
    setSaving(true); setError(''); setMessage('');
    try { await action(); await load(); } catch (caught: any) { setError(caught?.message || qualityError(caught)); } finally { setSaving(false); }
  };

  const handleSave = () => perform(async () => { await saveDraft(); setMessage('草稿及照片已保存 Draft and photo saved'); });
  const handleVerify = () => perform(async () => {
    if (!signature) throw new Error('请先完成品管手写签名 QA signature is required');
    if (editable) await saveDraft();
    const result = await qualityControlApi.verify(batchId, signature);
    setSignature(''); setMessage(result.status === 'approved' ? '品质检验已签核放行 Quality released' : '品质检验判定未通过 Quality rejected');
  });
  const handleRevise = () => perform(async () => { await qualityControlApi.revise(batchId); setMessage('已建立纠正复检版本 Corrective revision created'); });

  const preview = useMemo(() => photo ? URL.createObjectURL(photo) : photoUrl, [photo, photoUrl]);
  useEffect(() => () => { if (photo && preview) URL.revokeObjectURL(preview); }, [photo, preview]);

  if (loading && !context) return <LoadingSpinner />;
  if (error && !context) return <ErrorCard message={error} onRetry={load} />;
  if (!context) return <ErrorCard message="无法载入品质检验 Unable to load quality inspection" onRetry={load} />;

  return <div className="mx-auto max-w-5xl space-y-6 pb-12">
    <header className="space-y-3">
      <Link to={backTo} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"><ArrowLeftIcon className="h-5 w-5" />返回批次 Back to batch</Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-gray-900">批次品质检验 Quality Inspection</h1><p className="mt-1 text-sm text-gray-600">{context.batch_code} · {context.product_name} · {context.production_date}</p></div>
        <div className="text-right"><QualityStatusBadge status={record?.status} />{record && <p className="mt-1 text-xs text-gray-500">Revision {record.revision}</p>}</div>
      </div>
      {context.release_required && record?.status !== 'approved' && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">此批次完成品管放行前不能入库。Stock entry is blocked until QA release.</div>}
    </header>

    {error && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    {message && <div aria-live="polite" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}

    <section className="card space-y-5" aria-labelledby="sensory-heading">
      <div><h2 id="sensory-heading" className="text-lg font-semibold text-gray-900">1. 感官检验 Sensory checks</h2><p className="text-sm text-gray-500">逐项确认色泽、香气和味道；不适用或不合格必须说明。</p></div>
      <div><label htmlFor="inspection-at" className="label">检验时间 Inspection time *</label><input id="inspection-at" type="datetime-local" className="input max-w-sm" value={form.inspection_at || ''} disabled={!editable} onChange={(e) => setForm({ ...form, inspection_at: e.target.value })} /></div>
      <div className="grid gap-4 lg:grid-cols-3">
        <SensoryField id="color-result" label="色泽 Color *" value={form.color_result} disabled={!editable} onChange={(value) => setForm({ ...form, color_result: value })} />
        <SensoryField id="aroma-result" label="香气 Aroma *" value={form.aroma_result} disabled={!editable} onChange={(value) => setForm({ ...form, aroma_result: value })} />
        <SensoryField id="taste-result" label="味道 Taste *" value={form.taste_result} disabled={!editable} onChange={(value) => setForm({ ...form, taste_result: value })} />
      </div>
      {hasNA && <div><label htmlFor="na-reason" className="label">不适用原因 N/A reason *</label><textarea id="na-reason" className="input min-h-24" value={form.not_applicable_reason || ''} disabled={!editable} onChange={(e) => setForm({ ...form, not_applicable_reason: e.target.value })} /></div>}
      {hasFailure && <div><label htmlFor="corrective-action" className="label">不合格说明及纠正措施 Corrective action *</label><textarea id="corrective-action" className="input min-h-28 border-red-300" value={form.corrective_action || ''} disabled={!editable} onChange={(e) => setForm({ ...form, corrective_action: e.target.value })} /></div>}
      <div><label htmlFor="quality-notes" className="label">备注 Notes</label><textarea id="quality-notes" className="input min-h-24" value={form.notes || ''} disabled={!editable} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
    </section>

    <section className="card space-y-5" aria-labelledby="sample-heading">
      <div><h2 id="sample-heading" className="text-lg font-semibold text-gray-900">2. 留样记录 Retained sample</h2><p className="text-sm text-gray-500">留样编号留空时，保存后会按批次自动生成。</p></div>
      <fieldset disabled={!editable}><legend className="label">是否留样 Sample retained? *</legend><div className="mt-2 flex flex-wrap gap-3">
        {[{ value: true, label: '是 Yes' }, { value: false, label: '否 No' }].map((option) => <label key={String(option.value)} className={`flex min-h-11 min-w-28 cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 ${form.retained_sample === option.value ? 'border-primary-500 bg-primary-50' : 'border-gray-200'}`}><input type="radio" name="retained-sample" checked={form.retained_sample === option.value} onChange={() => setForm({ ...form, retained_sample: option.value })} />{option.label}</label>)}
      </div></fieldset>
      {form.retained_sample === false && <div><label htmlFor="no-sample-reason" className="label">未留样原因 Reason *</label><textarea id="no-sample-reason" className="input min-h-24" value={form.no_sample_reason || ''} disabled={!editable} onChange={(e) => setForm({ ...form, no_sample_reason: e.target.value })} /></div>}
      {form.retained_sample === true && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div><label htmlFor="sample-code" className="label">留样编号 Sample code</label><input id="sample-code" className="input" value={form.sample_code || ''} disabled={!editable} placeholder="自动生成 Auto" onChange={(e) => setForm({ ...form, sample_code: e.target.value })} /></div>
        <div><label htmlFor="sample-quantity" className="label">留样数量 Quantity *</label><input id="sample-quantity" type="number" min="0" step="0.001" className="input" value={form.sample_quantity || ''} disabled={!editable} onChange={(e) => setForm({ ...form, sample_quantity: e.target.value || null })} /></div>
        <div><label htmlFor="sample-unit" className="label">单位 Unit *</label><input id="sample-unit" className="input" value={form.sample_unit || ''} disabled={!editable} placeholder="g / 包 / pcs" onChange={(e) => setForm({ ...form, sample_unit: e.target.value })} /></div>
        <div><label htmlFor="sampled-at" className="label">留样时间 Sampled at *</label><input id="sampled-at" type="datetime-local" className="input" value={form.sampled_at || ''} disabled={!editable} onChange={(e) => setForm({ ...form, sampled_at: e.target.value })} /></div>
        <div><label htmlFor="storage-condition" className="label">保存条件 Storage *</label><select id="storage-condition" className="input" value={form.storage_condition || ''} disabled={!editable} onChange={(e) => setForm({ ...form, storage_condition: (e.target.value || null) as StorageCondition | null })}><option value="">请选择 Select</option><option value="ambient">常温 Ambient</option><option value="chilled">冷藏 Chilled</option><option value="frozen">冷冻 Frozen</option><option value="other">其他 Other</option></select></div>
        <div><label htmlFor="storage-location" className="label">保存位置 Location *</label><input id="storage-location" className="input" value={form.storage_location || ''} disabled={!editable} placeholder="QA 冰箱 / 层位" onChange={(e) => setForm({ ...form, storage_location: e.target.value })} /></div>
        <div><label htmlFor="disposal-date" className="label">到期/销毁日期 Disposal due *</label><input id="disposal-date" type="date" className="input" value={form.disposal_due_date || ''} disabled={!editable} onChange={(e) => setForm({ ...form, disposal_due_date: e.target.value || null })} /></div>
      </div>}
    </section>

    <section className="card space-y-4" aria-labelledby="photo-heading"><div><h2 id="photo-heading" className="text-lg font-semibold text-gray-900">3. 留样照片 Sample photo</h2><p className="text-sm text-gray-500">可选；手机会打开相机。上传前自动压缩，最大 5 MB。</p></div>
      {preview && <img className="max-h-96 w-full rounded-lg border object-contain" src={preview} alt={`批次 ${context.batch_code} 的留样照片`} />}
      {editable && <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"><CameraIcon className="h-5 w-5" />{preview ? '更换照片 Replace photo' : '拍照或选择照片 Add photo'}<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] || null)} /></label>}
      {record?.photo_original_name && <p className="text-xs text-gray-500">{record.photo_original_name} · {record.photo_size_bytes ? `${(record.photo_size_bytes / 1024).toFixed(0)} KB` : ''}</p>}
    </section>

    {record && record.status !== 'draft' && <section className="card space-y-3" aria-labelledby="signoff-heading"><h2 id="signoff-heading" className="text-lg font-semibold text-gray-900">4. 品管签核 QA sign-off</h2><p className="text-sm">{record.verifier_name || `User #${record.verified_by}`} · {record.verified_at ? new Date(record.verified_at).toLocaleString() : ''}</p>{record.verifier_signature_data_url && <img className="h-24 rounded-lg border bg-white object-contain" src={record.verifier_signature_data_url} alt="品管人员手写签名" />}</section>}

    {(editable || signable) && <section className="card space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-gray-900">保存与签核 Save and release</h2><p className="text-sm text-gray-500">生产人员可保存草稿；具有签核权限的品管人员完成最终判定。</p></div>{editable && <button type="button" className="btn btn-secondary min-h-11" disabled={saving} onClick={handleSave}>{saving ? '保存中…' : '保存草稿 Save draft'}</button>}</div>
      {signable && <div className="space-y-4 border-t pt-5"><SignaturePad value={signature} onChange={setSignature} label="品管手写签名 QA Signature" required disabled={saving} /><button type="button" className="btn btn-primary min-h-11 w-full sm:w-auto" disabled={saving || !signature} onClick={handleVerify}><ShieldCheckIcon className="mr-2 inline h-5 w-5" />签核并判定 Verify and lock</button></div>}
    </section>}

    {record?.status === 'rejected' && context.permissions.can_edit && !context.is_voided && <button type="button" className="btn btn-primary min-h-11" disabled={saving} onClick={handleRevise}>建立纠正复检版本 Create corrective revision</button>}
  </div>;
}
