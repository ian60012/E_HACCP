import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PlusIcon } from '@heroicons/react/24/solid';
import { ClipboardDocumentCheckIcon } from '@heroicons/react/24/outline';
import { cleaningChecklistsApi } from '@/api/cleaning-checklists';
import { CleaningChecklist, CleaningLineType } from '@/types/cleaning-checklist';
import { usePagination } from '@/hooks/usePagination';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import EmptyState from '@/components/EmptyState';
import Pagination from '@/components/Pagination';
import StatusBadge from '@/components/StatusBadge';
import RoleGate from '@/components/RoleGate';
import Bi, { bi } from '@/components/Bi';

const lineLabels: Record<CleaningLineType, { zh: string; en: string; code: string }> = {
  dumpling: { zh: '水餃線', en: 'Dumpling Line', code: 'FSP-LOG-CLN-003' },
  cooking: { zh: '烹飪線', en: 'Cooking Line', code: 'FSP-LOG-CLN-005' },
};

export default function CleaningChecklistsPage() {
  const [records, setRecords] = useState<CleaningChecklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lineType, setLineType] = useState<'' | CleaningLineType>('');
  const [checkDate, setCheckDate] = useState('');
  const [showVoided, setShowVoided] = useState(false);
  const pagination = usePagination(20);
  const navigate = useNavigate();

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await cleaningChecklistsApi.list({
        skip: pagination.skip,
        limit: pagination.limit,
        is_voided: showVoided,
        line_type: lineType || undefined,
        check_date: checkDate || undefined,
      });
      setRecords(response.items);
      pagination.setTotal(response.total);
    } catch {
      setError(bi('error.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [pagination.skip, pagination.limit, lineType, checkDate, showVoided]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800"><Bi k="page.cleaningChecklist.title" /></h1>
          <p className="mt-1 text-sm text-gray-500"><Bi k="page.cleaningChecklist.subtitle" /></p>
        </div>
        <RoleGate roles={['Admin', 'QA', 'Production']}>
          <div className="flex flex-wrap gap-2">
            {(['dumpling', 'cooking'] as CleaningLineType[]).map((line) => (
              <Link key={line} to={`/cleaning-checklists/new?line=${line}`} className="btn btn-primary flex items-center gap-1.5">
                <PlusIcon className="h-4 w-4" />
                <span>{lineLabels[line].zh}</span>
                <span className="hidden text-xs opacity-75 sm:inline">{lineLabels[line].en}</span>
              </Link>
            ))}
          </div>
        </RoleGate>
      </div>

      <div className="card grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="text-sm text-gray-600">
          <span className="mb-1 block font-medium">產線 Line</span>
          <select className="input" value={lineType} onChange={(event) => setLineType(event.target.value as '' | CleaningLineType)}>
            <option value="">全部 All lines</option>
            <option value="dumpling">水餃線 Dumpling Line</option>
            <option value="cooking">烹飪線 Cooking Line</option>
          </select>
        </label>
        <label className="text-sm text-gray-600">
          <span className="mb-1 block font-medium">查核日期 Check date</span>
          <input type="date" className="input" value={checkDate} onChange={(event) => setCheckDate(event.target.value)} />
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm text-gray-600">
          <input type="checkbox" className="rounded border-gray-300" checked={showVoided} onChange={(event) => setShowVoided(event.target.checked)} />
          僅顯示已作廢 Show voided only
        </label>
      </div>

      {loading ? <LoadingSpinner /> : error ? <ErrorCard message={error} onRetry={fetchRecords} /> : records.length === 0 ? (
        <EmptyState message="目前沒有符合條件的清潔查核記錄 No matching cleaning checklists" />
      ) : (
        <div className="space-y-3">
          {records.map((record) => {
            const clean = record.items.filter((item) => item.result === 'clean').length;
            const issues = record.items.length - clean;
            const line = lineLabels[record.line_type];
            return (
              <button
                type="button"
                key={record.id}
                onClick={() => navigate(`/cleaning-checklists/${record.id}`)}
                className={`card w-full text-left transition-shadow hover:shadow-lg ${record.is_voided ? 'opacity-55' : ''}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="rounded-lg bg-sky-50 p-2 text-sky-700"><ClipboardDocumentCheckIcon className="h-6 w-6" /></div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-gray-800">{line.zh} <span className="text-xs font-normal text-gray-400">{line.en}</span></span>
                        <span className="text-sm text-gray-500">{record.check_date}</span>
                        {issues === 0 ? <StatusBadge status="Pass" /> : <StatusBadge status="Fail" />}
                        {record.is_locked && !record.is_voided && <StatusBadge status="Locked" />}
                        {record.is_voided && <StatusBadge status="Voided" />}
                      </div>
                      <p className="mt-1 text-sm text-gray-500">
                        {clean}/{record.items.length} 清潔完成 Clean · {issues} 項需跟進 Require follow-up
                      </p>
                      <p className="mt-1 text-xs text-gray-400">{line.code} · {record.operator_name || '—'}</p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400">#{record.id}</span>
                </div>
              </button>
            );
          })}
          <Pagination
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            total={pagination.total}
            hasNext={pagination.hasNext}
            hasPrev={pagination.hasPrev}
            onNext={pagination.nextPage}
            onPrev={pagination.prevPage}
          />
        </div>
      )}
    </div>
  );
}
