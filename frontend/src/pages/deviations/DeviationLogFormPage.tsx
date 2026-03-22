import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { deviationLogsApi } from '@/api/deviation-logs';
import { LogType, Severity, ImmediateAction } from '@/types/deviation-log';
import FormField from '@/components/FormField';
import Bi, { bi } from '@/components/Bi';

const sourceLabels: Record<LogType, { zh: string; en: string }> = {
  receiving: { zh: '收貨', en: 'Receiving' },
  cooking: { zh: '烹飪', en: 'Cooking' },
  cooling: { zh: '冷卻', en: 'Cooling' },
  sanitising: { zh: '清潔', en: 'Sanitising' },
  assembly: { zh: '組裝包裝', en: 'Assembly & Packing' },
};

const severityLabels: Record<Severity, { zh: string; en: string }> = {
  Critical: { zh: '嚴重', en: 'Critical' },
  Major: { zh: '主要', en: 'Major' },
  Minor: { zh: '次要', en: 'Minor' },
};

const actionLabels: Record<ImmediateAction, { zh: string; en: string }> = {
  Quarantine: { zh: '隔離', en: 'Quarantine' },
  Hold: { zh: '保留', en: 'Hold' },
  Discard: { zh: '丟棄', en: 'Discard' },
  Rework: { zh: '返工', en: 'Rework' },
  Other: { zh: '其他', en: 'Other' },
};

export default function DeviationLogFormPage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [sourceLogType, setSourceLogType] = useState<LogType | ''>('');
  const [sourceLogId, setSourceLogId] = useState<number | ''>('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<Severity>('Minor');
  const [immediateAction, setImmediateAction] = useState<ImmediateAction | ''>('');
  const [immediateActionDetail, setImmediateActionDetail] = useState('');
  const [notes, setNotes] = useState('');

  // Validation
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const descriptionError =
    touched.description && description.trim().length < 5
      ? '偏差描述至少需要 5 個字'
      : '';
  const sourceTypeError =
    touched.sourceLogType && !sourceLogType ? '請選擇來源類型' : '';
  const sourceIdError =
    touched.sourceLogId && !sourceLogId ? '請輸入來源記錄 ID' : '';
  const actionError =
    touched.immediateAction && !immediateAction ? '請選擇即時措施' : '';

  const canSubmit =
    !!sourceLogType &&
    !!sourceLogId &&
    description.trim().length >= 5 &&
    !!immediateAction;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError('');
    setSubmitting(true);

    try {
      const created = await deviationLogsApi.create({
        source_log_type: sourceLogType as LogType,
        source_log_id: Number(sourceLogId),
        description: description.trim(),
        severity,
        immediate_action: immediateAction as ImmediateAction,
        immediate_action_detail: immediateActionDetail.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      navigate(`/deviations/${created.id}`);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail;
      setError(detail || '建立偏差記錄失敗');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/deviations"
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-800"><Bi k="page.deviation.new" /></h1>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card space-y-4">
        {/* Source Log Type */}
        <FormField label={<Bi k="field.sourceLogType" />} required error={sourceTypeError}>
          <select
            value={sourceLogType}
            onChange={(e) => setSourceLogType(e.target.value as LogType | '')}
            onBlur={() => setTouched((t) => ({ ...t, sourceLogType: true }))}
            className="input"
            required
          >
            <option value="">{bi('placeholder.selectSource')}</option>
            {(Object.entries(sourceLabels) as [LogType, { zh: string; en: string }][]).map(
              ([value, label]) => (
                <option key={value} value={value}>
                  {label.zh} {label.en} ({value})
                </option>
              )
            )}
          </select>
        </FormField>

        {/* Source Log ID */}
        <FormField
          label={<Bi k="field.sourceLogId" />}
          required
          error={sourceIdError}
          hint={bi('hint.sourceLogId')}
        >
          <input
            type="number"
            value={sourceLogId}
            onChange={(e) =>
              setSourceLogId(e.target.value ? Number(e.target.value) : '')
            }
            onBlur={() => setTouched((t) => ({ ...t, sourceLogId: true }))}
            className="input"
            placeholder="例如 e.g. 1"
            required
            min={1}
          />
        </FormField>

        {/* Description */}
        <FormField label={<Bi k="field.deviationDescription" />} required error={descriptionError}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, description: true }))}
            className="input min-h-[100px]"
            placeholder={bi('hint.deviationDesc')}
            required
            minLength={5}
          />
        </FormField>

        {/* Severity */}
        <FormField label={<Bi k="field.severity" />} required>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as Severity)}
            className="input"
          >
            {(Object.entries(severityLabels) as [Severity, { zh: string; en: string }][]).map(
              ([value, label]) => (
                <option key={value} value={value}>
                  {label.zh} {label.en} ({value})
                </option>
              )
            )}
          </select>
        </FormField>

        {/* Immediate Action */}
        <FormField label={<Bi k="field.immediateAction" />} required error={actionError}>
          <select
            value={immediateAction}
            onChange={(e) =>
              setImmediateAction(e.target.value as ImmediateAction | '')
            }
            onBlur={() => setTouched((t) => ({ ...t, immediateAction: true }))}
            className="input"
            required
          >
            <option value="">{bi('placeholder.selectAction')}</option>
            {(
              Object.entries(actionLabels) as [ImmediateAction, { zh: string; en: string }][]
            ).map(([value, label]) => (
              <option key={value} value={value}>
                {label.zh} {label.en} ({value})
              </option>
            ))}
          </select>
        </FormField>

        {/* Immediate Action Detail */}
        <FormField label={<Bi k="field.immediateActionDetail" />} hint={bi('hint.actionDetail')}>
          <textarea
            value={immediateActionDetail}
            onChange={(e) => setImmediateActionDetail(e.target.value)}
            className="input min-h-[60px]"
            placeholder={bi('hint.actionDetail')}
          />
        </FormField>

        {/* Notes */}
        <FormField label={<Bi k="field.notes" />}>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input min-h-[60px]"
            placeholder={bi('hint.notesOptional')}
          />
        </FormField>

        {/* Submit */}
        <div className="flex items-center gap-3 pt-4 border-t">
          <button
            type="submit"
            disabled={submitting || !canSubmit}
            className="btn btn-primary flex-1 sm:flex-none"
          >
            {submitting ? <Bi k="btn.saving" /> : <Bi k="btn.createDeviation" />}
          </button>
          <Link to="/deviations" className="btn btn-secondary">
            <Bi k="btn.cancel" />
          </Link>
        </div>
      </form>
    </div>
  );
}
