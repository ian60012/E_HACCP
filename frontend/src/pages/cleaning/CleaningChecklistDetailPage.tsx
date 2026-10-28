import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftIcon, PencilSquareIcon } from '@heroicons/react/24/outline';
import { cleaningChecklistsApi } from '@/api/cleaning-checklists';
import { CleaningChecklist, CleaningChecklistItem, CleaningCheckResult } from '@/types/cleaning-checklist';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import ALCOAAuditBar from '@/components/ALCOAAuditBar';
import ConfirmDialog from '@/components/ConfirmDialog';
import RoleGate from '@/components/RoleGate';

const resultLabels: Record<CleaningCheckResult, { zh: string; en: string; classes: string }> = {
  clean: { zh: '完成／清潔／正常', en: 'Finished / Cleaned / OK', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  needs_cleaning: { zh: '未完成／需清潔', en: 'Unfinished / Needs Cleaning', classes: 'bg-amber-50 text-amber-700 border-amber-200' },
  damaged_faulty: { zh: '損壞／故障', en: 'Damaged / Faulty', classes: 'bg-red-50 text-red-700 border-red-200' },
};

export default function CleaningChecklistDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = useState<CleaningChecklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lockLoading, setLockLoading] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidLoading, setVoidLoading] = useState(false);

  useEffect(() => {
    cleaningChecklistsApi.get(Number(id))
      .then(setRecord)
      .catch(() => setError('載入清潔查核表失敗 Failed to load cleaning checklist'))
      .finally(() => setLoading(false));
  }, [id]);

  const groups = useMemo(() => {
    const grouped = new Map<string, CleaningChecklistItem[]>();
    record?.items.forEach((item) => {
      const key = `${item.section_code}|${item.section_name_zh}|${item.section_name_en}`;
      grouped.set(key, [...(grouped.get(key) || []), item]);
    });
    return [...grouped.entries()];
  }, [record]);

  const handleLock = async () => {
    if (!record) return;
    setLockLoading(true);
    try { setRecord(await cleaningChecklistsApi.lock(record.id)); }
    catch (err: any) { alert(err.response?.data?.detail || '鎖定失敗 Lock failed'); }
    finally { setLockLoading(false); }
  };

  const handleVoid = async (reason?: string) => {
    if (!record || !reason) return;
    setVoidLoading(true);
    try {
      setRecord(await cleaningChecklistsApi.void(record.id, { void_reason: reason }));
      setVoidOpen(false);
    } catch (err: any) { alert(err.response?.data?.detail || '作廢失敗 Void failed'); }
    finally { setVoidLoading(false); }
  };

  if (loading) return <LoadingSpinner />;
  if (error || !record) return <ErrorCard message={error || 'Record not found'} />;
  const isDumpling = record.line_type === 'dumpling';
  const issues = record.items.filter((item) => item.result !== 'clean').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <button type="button" onClick={() => navigate('/cleaning-checklists')} className="rounded-lg p-2 hover:bg-gray-100" aria-label="返回 Back">
            <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{isDumpling ? '水餃線每日清潔查核' : '烹飪線每日清潔查核'}</h1>
            <p className="mt-1 text-sm text-gray-500">{isDumpling ? 'Dumpling Line Daily Cleaning Checklist · FSP-LOG-CLN-003' : 'Cooking Line Daily Cleaning Checklist · FSP-LOG-CLN-005'}</p>
          </div>
        </div>
        {!record.is_locked && !record.is_voided && (
          <RoleGate roles={['Admin', 'QA', 'Production']}>
            <Link to={`/cleaning-checklists/${record.id}/edit`} className="btn btn-secondary flex items-center gap-1.5">
              <PencilSquareIcon className="h-4 w-4" />編輯 Edit
            </Link>
          </RoleGate>
        )}
      </div>

      <div className="card grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div><p className="text-xs text-gray-400">查核日期 Check date</p><p className="mt-1 font-semibold text-gray-800">{record.check_date}</p></div>
        <div><p className="text-xs text-gray-400">查核項目 Items</p><p className="mt-1 font-semibold text-gray-800">{record.items.length}</p></div>
        <div><p className="text-xs text-gray-400">需跟進 Follow-up</p><p className={`mt-1 font-semibold ${issues ? 'text-red-600' : 'text-emerald-600'}`}>{issues}</p></div>
      </div>

      {groups.map(([key, items]) => {
        const [sectionCode, sectionZh, sectionEn] = key.split('|');
        return (
          <section key={key} className="card overflow-hidden p-0">
            <div className="border-b border-gray-200 bg-gray-50 px-5 py-4"><h2 className="font-semibold text-gray-800">{sectionCode} {sectionZh} <span className="ml-1 text-sm font-normal text-gray-400">{sectionEn}</span></h2></div>
            <div className="divide-y divide-gray-100">
              {items.map((item) => {
                const label = item.result ? resultLabels[item.result] : null;
                return (
                  <div key={item.code} className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.8fr)_minmax(0,1fr)] md:items-center">
                    <div><p className="font-medium text-gray-800">{item.code} {item.item_name_zh}</p><p className="text-sm text-gray-400">{item.item_name_en}</p></div>
                    {label ? <div className={`rounded-lg border px-3 py-2 text-sm ${label.classes}`}><span className="block font-medium">{label.zh}</span><span className="text-xs opacity-75">{label.en}</span></div> : <span className="text-sm text-gray-400">未填 Not completed</span>}
                    <p className="text-sm text-gray-600">{item.comments || '—'}</p>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {record.notes && <div className="card"><h2 className="font-semibold text-gray-800">整體備註 General notes</h2><p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">{record.notes}</p></div>}

      <ALCOAAuditBar
        operatorName={record.operator_name}
        verifierName={record.verifier_name}
        createdAt={record.created_at}
        isLocked={record.is_locked}
        isVoided={record.is_voided}
        voidReason={record.void_reason}
        voidedAt={record.voided_at}
        voidedBy={record.voided_by}
        onLock={handleLock}
        onVoid={() => setVoidOpen(true)}
        lockLoading={lockLoading}
      />

      <ConfirmDialog
        open={voidOpen}
        title="作廢清潔查核 Void Cleaning Checklist"
        message="作廢後仍會保留完整稽核紀錄，且無法再編輯。 The audit trail will be retained and the record cannot be edited."
        confirmLabel="確認作廢 Void"
        requireReason
        reasonLabel="作廢原因 Void reason"
        reasonMinLength={5}
        onConfirm={handleVoid}
        onCancel={() => setVoidOpen(false)}
        loading={voidLoading}
      />
    </div>
  );
}
