import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { sanitisingLogsApi } from '@/api/sanitising-logs';
import { areasApi } from '@/api/areas';
import { SanitisingLog, SanitisingLogCreate, SanitisingLogUpdate } from '@/types/sanitising-log';
import { Area } from '@/types/area';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import FormField from '@/components/FormField';
import CCPIndicator from '@/components/CCPIndicator';
import Bi, { bi } from '@/components/Bi';
import { useAuth } from '@/hooks/useAuth';

type ChemicalType = 'Buff' | 'Hybrid' | 'Command' | 'Keyts' | 'Chlorine';

const CHEMICAL_OPTIONS: { value: ChemicalType; label: string }[] = [
  { value: 'Buff', label: 'Buff' },
  { value: 'Hybrid', label: 'Hybrid' },
  { value: 'Command', label: 'Command' },
  { value: 'Keyts', label: 'Keyts' },
  { value: 'Chlorine', label: '氯系消毒液' },
];

export default function SanitisingLogFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [areas, setAreas] = useState<Area[]>([]);

  // Form state
  const [areaId, setAreaId] = useState<number>(0);
  const [targetDescription, setTargetDescription] = useState('');
  const [chemical, setChemical] = useState<ChemicalType>('Buff');
  const [dilutionRatio, setDilutionRatio] = useState('');
  const [atpResultRlu, setAtpResultRlu] = useState('');
  const [atpStatus, setAtpStatus] = useState<'Pass' | 'Fail' | ''>('');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [notes, setNotes] = useState('');

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Auto-calculate ATP status from RLU value
  useEffect(() => {
    if (atpResultRlu === '') {
      setAtpStatus('');
      return;
    }
    const rlu = Number(atpResultRlu);
    if (!isNaN(rlu)) {
      setAtpStatus(rlu <= 100 ? 'Pass' : 'Fail');
    }
  }, [atpResultRlu]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const areasRes = await areasApi.list(0, 200);
        setAreas(areasRes.items.filter((a) => a.is_active));

        if (isEdit && id) {
          const log = await sanitisingLogsApi.get(Number(id));
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

  const populateForm = (log: SanitisingLog) => {
    setAreaId(log.area_id);
    setTargetDescription(log.target_description);
    setChemical(log.chemical);
    setDilutionRatio(log.dilution_ratio || '');
    setAtpResultRlu(log.atp_result_rlu != null ? String(log.atp_result_rlu) : '');
    setAtpStatus(log.atp_status || '');
    setCorrectiveAction(log.corrective_action || '');
    setNotes(log.notes || '');
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!isEdit && !areaId) {
      newErrors.areaId = '請選擇清潔區域';
    }

    if (!targetDescription.trim()) {
      newErrors.targetDescription = '請填寫清潔對象';
    }

    if (atpStatus === 'Fail' && !correctiveAction.trim()) {
      newErrors.correctiveAction = 'ATP 失敗時，必須填寫矯正措施';
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
        const updateData: SanitisingLogUpdate = {
          atp_result_rlu: atpResultRlu ? Number(atpResultRlu) : undefined,
          atp_status: atpStatus === 'Pass' || atpStatus === 'Fail' ? atpStatus : undefined,
          corrective_action: correctiveAction || undefined,
          notes: notes || undefined,
        };
        await sanitisingLogsApi.update(Number(id), updateData);
        navigate(`/sanitising-logs/${id}`);
      } else {
        const createData: SanitisingLogCreate = {
          area_id: areaId,
          target_description: targetDescription,
          chemical: chemical,
          dilution_ratio: dilutionRatio || undefined,
          atp_result_rlu: atpResultRlu ? Number(atpResultRlu) : undefined,
          atp_status: atpStatus === 'Pass' || atpStatus === 'Fail' ? atpStatus : undefined,
          corrective_action: correctiveAction || undefined,
          notes: notes || undefined,
        };
        const created = await sanitisingLogsApi.create(createData);
        navigate(`/sanitising-logs/${created.id}`);
      }
    } catch {
      setError(isEdit ? '更新失敗' : '建立失敗');
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
          onClick={() => navigate(isEdit ? `/sanitising-logs/${id}` : '/sanitising-logs')}
          className="p-2 rounded-lg hover:bg-gray-100"
        >
          <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            {isEdit ? <Bi k="page.sanitising.edit" /> : <Bi k="page.sanitising.new" />}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">FSP-LOG-005 清潔消毒檢查</p>
          <p className="text-sm text-gray-500">記錄人 Operator: <span className="font-medium text-gray-700">{user?.full_name}</span></p>
        </div>
      </div>

      {error && <ErrorCard message={error} />}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Area & Target */}
        <div className="card space-y-4">
          <h2 className="text-lg font-semibold text-gray-800"><Bi k="section.cleaningInfo" /></h2>

          <FormField label={<Bi k="field.cleanArea" />} required error={errors.areaId}>
            <select
              value={areaId}
              onChange={(e) => setAreaId(Number(e.target.value))}
              className="input"
              disabled={isEdit}
            >
              <option value={0}>請選擇清潔區域</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label={<Bi k="field.cleanTarget" />} required error={errors.targetDescription}>
            <input
              type="text"
              value={targetDescription}
              onChange={(e) => setTargetDescription(e.target.value)}
              className="input"
              placeholder="例：工作檯面、砧板、刀具"
              disabled={isEdit}
            />
          </FormField>
        </div>

        {/* Chemical */}
        <div className="card space-y-4">
          <h2 className="text-lg font-semibold text-gray-800"><Bi k="section.chemicalInfo" /></h2>

          <FormField label={<Bi k="field.chemicalUsed" />} required>
            <select
              value={chemical}
              onChange={(e) => setChemical(e.target.value as ChemicalType)}
              className="input"
              disabled={isEdit}
            >
              {CHEMICAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label={<Bi k="field.dilutionRatio" />} hint="例：1:100">
            <input
              type="text"
              value={dilutionRatio}
              onChange={(e) => setDilutionRatio(e.target.value)}
              className="input"
              placeholder="例：1:100"
              disabled={isEdit}
            />
          </FormField>
        </div>

        {/* ATP */}
        <div className="card space-y-4">
          <h2 className="text-lg font-semibold text-gray-800"><Bi k="section.atpTesting" /></h2>

          <FormField label={<Bi k="field.atpValue" />} hint="Standard: ≤ 100 RLU">
            <input
              type="number"
              step="1"
              min="0"
              value={atpResultRlu}
              onChange={(e) => setAtpResultRlu(e.target.value)}
              className="input"
              placeholder="例：50"
            />
          </FormField>

          {/* Auto-calculated status display */}
          {atpStatus && (
            <div className="text-sm text-gray-600">
              自動判定：
              <span className={atpStatus === 'Pass' ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                {atpStatus === 'Pass' ? '通過' : '失敗'}
              </span>
            </div>
          )}

          {/* CCP Indicator */}
          <CCPIndicator
            value={atpResultRlu}
            limit={100}
            unit=" RLU"
            mode="lte"
            label="ATP"
          />
        </div>

        {/* Corrective Action */}
        <div className="card space-y-4">
          <h2 className="text-lg font-semibold text-gray-800"><Bi k="section.correctiveAction" /></h2>

          <FormField
            label={<Bi k="field.correctiveAction" />}
            required={atpStatus === 'Fail'}
            error={errors.correctiveAction}
          >
            <textarea
              value={correctiveAction}
              onChange={(e) => setCorrectiveAction(e.target.value)}
              className="input min-h-[100px]"
              placeholder={
                atpStatus === 'Fail'
                  ? 'ATP 失敗，請描述採取的矯正措施...'
                  : '如有需要，請描述矯正措施...'
              }
            />
          </FormField>
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
              navigate(isEdit ? `/sanitising-logs/${id}` : '/sanitising-logs')
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
