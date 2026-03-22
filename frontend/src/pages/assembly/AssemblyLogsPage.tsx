import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { assemblyLogsApi } from '@/api/assembly-logs';
import { AssemblyPackingLog } from '@/types/assembly-log';
import { usePagination } from '@/hooks/usePagination';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import EmptyState from '@/components/EmptyState';
import Pagination from '@/components/Pagination';
import StatusBadge from '@/components/StatusBadge';
import Bi, { bi } from '@/components/Bi';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', {
    timeZone: 'Australia/Melbourne', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

export default function AssemblyLogsPage() {
  const [logs, setLogs] = useState<AssemblyPackingLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showVoided, setShowVoided] = useState(false);
  const pagination = usePagination(20);
  const navigate = useNavigate();

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await assemblyLogsApi.list({
        skip: pagination.skip,
        limit: pagination.limit,
        is_voided: showVoided ? undefined : false,
      });
      setLogs(res.items);
      pagination.setTotal(res.total);
    } catch {
      setError(bi('error.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [pagination.skip, pagination.limit, showVoided]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">組裝包裝記錄 Assembly & Packing</h1>
          <p className="text-sm text-gray-500 mt-1">標籤查驗、重量抽檢、封口完整性</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} className="rounded border-gray-300" />
          <Bi k="btn.showVoided" />
        </label>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorCard message={error} onRetry={fetchLogs} />
      ) : logs.length === 0 ? (
        <EmptyState message="尚無組裝包裝記錄" />
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div
              key={log.id}
              onClick={() => navigate(`/assembly-logs/${log.id}`)}
              className={`card cursor-pointer hover:shadow-lg transition-shadow ${log.is_voided ? 'opacity-50' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-800">{log.prod_batch_code ?? `#${log.prod_batch_id}`}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${log.is_allergen_declared ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      過敏原 {log.is_allergen_declared ? '✓' : '✗'}
                    </span>
                    {log.seal_integrity && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${log.seal_integrity === 'Pass' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        封口 {log.seal_integrity}
                      </span>
                    )}
                    {log.coding_legibility && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${log.coding_legibility === 'Pass' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        編碼 {log.coding_legibility}
                      </span>
                    )}
                    {log.is_voided && <StatusBadge status="Voided" />}
                    {log.is_locked && !log.is_voided && <StatusBadge status="Locked" />}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                    {log.average_weight_g && <span>平均重量: {log.average_weight_g}g</span>}
                    {log.target_weight_g && <span>目標: {log.target_weight_g}g</span>}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">{log.operator_name || '—'}</div>
                </div>
                <div className="text-xs text-gray-400 ml-4 whitespace-nowrap">{formatDateTime(log.created_at)}</div>
              </div>
            </div>
          ))}
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
