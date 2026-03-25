import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { ppeComplianceLogsApi } from '@/api/ppe-compliance-logs';
import { areasApi } from '@/api/areas';
import { PPEComplianceLog, PPEComplianceLogCreate, PPEComplianceLogUpdate, PassFail } from '@/types/ppe-compliance-log';
import { Area } from '@/types/area';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import FormField from '@/components/FormField';
import Bi, { bi } from '@/components/Bi';
import { useAuth } from '@/hooks/useAuth';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const PPE_ITEMS: { key: string; zhLabel: string; enLabel: string }[] = [
  { key: 'hair_net', zhLabel: '髮網', enLabel: 'Hair Net' },
  { key: 'beard_net', zhLabel: '鬍鬚網', enLabel: 'Beard Net' },
  { key: 'clean_uniform', zhLabel: '乾淨制服', enLabel: 'Clean Uniform' },
  { key: 'no_nail_polish', zhLabel: '無指甲油', enLabel: 'No Nail Polish' },
  { key: 'safety_shoes', zhLabel: '安全鞋', enLabel: 'Safety Shoes' },
  { key: 'single_use_mask', zhLabel: '一次性口罩', enLabel: 'Single-use Mask' },
  { key: 'no_jewellery', zhLabel: '無飾品', enLabel: 'No Jewellery' },
  { key: 'hand_hygiene', zhLabel: '手部衛生', enLabel: 'Hand Hygiene' },
  { key: 'gloves', zhLabel: '手套', enLabel: 'Gloves' },
];

export default function PPEComplianceLogFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [areas, setAreas] = useState<Area[]>([]);

  // Form state
  const [checkDate, setCheckDate] = useState(todayStr());
  const [areaId, setAreaId] = useState<number>(0);
  const [staffCount, setStaffCount] = useState('');
  const [ppeValues, setPpeValues] = useState<Record<string, PassFail>>(() => {
    const init: Record<string, PassFail> = {};
    PPE_ITEMS.forEach(item => { init[item.key] = 'Pass'; });
    return init;
  });
  const [detailsActions, setDetailsActions] = useState('');
  const [capaNo, setCapaNo] = useState('');

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const areasRes = await areasApi.list(0, 200);
        setAreas(areasRes.items.filter((a) => a.is_active));

        if (isEdit && id) {
          const log = await ppeComplianceLogsApi.get(Number(id));
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

  const populateForm = (log: PPEComplianceLog) => {
    setCheckDate(log.check_date);
    setAreaId(log.area_id);
    setStaffCount(String(log.staff_count));
    const vals: Record<string, PassFail> = {};
    PPE_ITEMS.forEach(item => {
      vals[item.key] = log[item.key as keyof PPEComplianceLog] as PassFail;
    });
    setPpeValues(vals);
    setDetailsActions(log.details_actions || '');
    setCapaNo(log.capa_no || '');
  };

  const togglePPE = (key: string) => {
    setPpeValues(prev => ({
      ...prev,
      [key]: prev[key] === 'Pass' ? 'Fail' : 'Pass',
    }));
  };

  const failCount = Object.values(ppeValues).filter(v => v === 'Fail').length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!areaId) {
      setError('請選擇檢查區域');
      return;
    }
    if (!staffCount || Number(staffCount) < 1) {
      setError('請填寫受檢人數');
      return;
    }

    setSaving(true);
    setError('');
    try {
      if (isEdit && id) {
        const updateData: PPEComplianceLogUpdate = {
          ...ppeValues as any,
          details_actions: detailsActions || undefined,
          capa_no: capaNo || undefined,
        };
        await ppeComplianceLogsApi.update(Number(id), updateData);
        navigate(`/ppe-compliance-logs/${id}`);
      } else {
        const createData: PPEComplianceLogCreate = {
          check_date: checkDate,
          area_id: areaId,
          staff_count: Number(staffCount),
          ...ppeValues as any,
          details_actions: detailsActions || undefined,
          capa_no: capaNo || undefined,
        };
        const created = await ppeComplianceLogsApi.create(createData);
        navigate(`/ppe-compliance-logs/${created.id}`);
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
          onClick={() => navigate(isEdit ? `/ppe-compliance-logs/${id}` : '/ppe-compliance-logs')}
          className="p-2 rounded-lg hover:bg-gray-100"
        >
          <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            {isEdit ? <Bi k="page.ppe.edit" /> : <Bi k="page.ppe.new" />}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">FSP-LOG-PPE-001</p>
          <p className="text-sm text-gray-500">QA: <span className="font-medium text-gray-700">{user?.full_name}</span></p>
        </div>
      </div>

      {error && <ErrorCard message={error} />}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="card space-y-4">
          <h2 className="text-lg font-semibold text-gray-800"><Bi k="section.checkInfo" /></h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label={<Bi k="field.checkDate" />} required>
              <input
                type="date"
                value={checkDate}
                onChange={(e) => setCheckDate(e.target.value)}
                className="input"
                required
                disabled={isEdit}
              />
            </FormField>

            <FormField label={<Bi k="field.checkArea" />} required>
              <select
                value={areaId}
                onChange={(e) => setAreaId(Number(e.target.value))}
                className="input"
                disabled={isEdit}
              >
                <option value={0}>請選擇區域</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </FormField>

            <FormField label={<Bi k="field.staffCount" />} required>
              <input
                type="number"
                min="1"
                value={staffCount}
                onChange={(e) => setStaffCount(e.target.value)}
                className="input"
                required
                disabled={isEdit}
                placeholder="受檢人數"
              />
            </FormField>
          </div>
        </div>

        {/* PPE Check Items */}
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800"><Bi k="section.ppeItems" /></h2>
            {failCount > 0 && (
              <span className="text-sm font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded">
                {failCount} Fail
              </span>
            )}
          </div>

          <div className="space-y-2">
            {PPE_ITEMS.map((item) => {
              const val = ppeValues[item.key];
              const isFail = val === 'Fail';
              return (
                <div
                  key={item.key}
                  className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                    isFail
                      ? 'border-red-200 bg-red-50'
                      : 'border-green-200 bg-green-50'
                  }`}
                  onClick={() => togglePPE(item.key)}
                >
                  <span className="font-medium text-gray-800">
                    {item.zhLabel}
                    <span className="text-gray-400 text-xs ml-1 font-normal">{item.enLabel}</span>
                  </span>
                  <button
                    type="button"
                    className={`px-3 py-1 rounded-full text-sm font-semibold transition-colors ${
                      isFail
                        ? 'bg-red-500 text-white'
                        : 'bg-green-500 text-white'
                    }`}
                    onClick={(e) => { e.stopPropagation(); togglePPE(item.key); }}
                  >
                    {isFail ? 'Fail' : 'Pass'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions & CAPA */}
        <div className="card space-y-4">
          <h2 className="text-lg font-semibold text-gray-800"><Bi k="section.actionsCAPA" /></h2>

          <FormField label={<Bi k="field.detailsActions" />}>
            <textarea
              value={detailsActions}
              onChange={(e) => setDetailsActions(e.target.value)}
              className="input min-h-[100px]"
              placeholder="Details / Immediate Actions 詳情及即時處置"
            />
          </FormField>

          <FormField label={<Bi k="field.capaNo" />}>
            <input
              type="text"
              value={capaNo}
              onChange={(e) => setCapaNo(e.target.value)}
              className="input"
              placeholder="CAPA-2026-001"
              maxLength={50}
            />
          </FormField>
        </div>

        {/* Submit */}
        <div className="flex items-center gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? <Bi k="btn.saving" /> : isEdit ? <Bi k="btn.updateRecord" /> : <Bi k="btn.createRecord" />}
          </button>
          <button
            type="button"
            onClick={() => navigate(isEdit ? `/ppe-compliance-logs/${id}` : '/ppe-compliance-logs')}
            className="btn btn-secondary"
          >
            <Bi k="btn.cancel" />
          </button>
        </div>
      </form>
    </div>
  );
}
