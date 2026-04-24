import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowTopRightOnSquareIcon, LockClosedIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { adminApi, ActivityItem } from '@/api/admin';
import { usePagination } from '@/hooks/usePagination';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import Pagination from '@/components/Pagination';
import { formatMelbourne } from '@/utils/timezone';

// ── Module metadata ──────────────────────────────────────────────────────────

const MODULE_LABELS: Record<string, string> = {
  cooking:    '烹飪',
  mixing:     '攪拌',
  cooling:    '冷卻',
  receiving:  '收貨',
  sanitising: '清潔',
  deviation:  '偏差',
  ppe:        'PPE',
  assembly:   '組裝',
  batch:      '生產批次',
  batch_sheet:'批次表單',
};

const MODULE_COLORS: Record<string, string> = {
  cooking:    'bg-orange-100 text-orange-700',
  mixing:     'bg-purple-100 text-purple-700',
  cooling:    'bg-blue-100 text-blue-700',
  receiving:  'bg-teal-100 text-teal-700',
  sanitising: 'bg-green-100 text-green-700',
  deviation:  'bg-red-100 text-red-700',
  ppe:        'bg-yellow-100 text-yellow-700',
  assembly:   'bg-indigo-100 text-indigo-700',
  batch:      'bg-gray-100 text-gray-700',
  batch_sheet:'bg-sky-100 text-sky-700',
};

function recordUrl(item: ActivityItem): string {
  const id = item.record_id;
  switch (item.module) {
    case 'cooking':     return `/cooking-logs/${id}`;
    case 'mixing':      return `/mixing-logs/${id}`;
    case 'cooling':     return `/cooling-logs/${id}`;
    case 'receiving':   return `/receiving-logs/${id}`;
    case 'sanitising':  return `/sanitising-logs/${id}`;
    case 'deviation':   return `/deviations/${id}`;
    case 'ppe':         return `/ppe-compliance-logs/${id}`;
    case 'assembly':    return `/assembly-logs/${id}`;
    case 'batch':       return `/production/batches/${id}`;
    case 'batch_sheet': return `/batch-sheets/${id}`;
    default:            return '#';
  }
}

const ALL_MODULES = Object.keys(MODULE_LABELS);

// ── Component ────────────────────────────────────────────────────────────────

export default function ActivityLogPage() {
  const navigate = useNavigate();
  const pagination = usePagination(50);

  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [operatorFilter, setOperatorFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');

  const fetchActivity = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminApi.getActivity({
        skip: pagination.skip,
        limit: pagination.limit,
        operator_name: operatorFilter || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        module: moduleFilter || undefined,
      });
      setItems(res.items);
      pagination.setTotal(res.total);
    } catch {
      setError('無法載入資料');
    } finally {
      setLoading(false);
    }
  }, [pagination.skip, pagination.limit, operatorFilter, dateFrom, dateTo, moduleFilter]);

  useEffect(() => { fetchActivity(); }, [fetchActivity]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">操作記錄 Activity Log</h1>
        <p className="text-sm text-gray-500 mt-1">所有模組的填寫記錄，依時間排列（Admin only）</p>
      </div>

      {/* Filters */}
      <div className="card space-y-3">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            value={operatorFilter}
            onChange={(e) => setOperatorFilter(e.target.value)}
            placeholder="搜尋填寫人姓名…"
            className="input flex-1 min-w-40"
          />
          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="input w-36"
          >
            <option value="">所有模組</option>
            {ALL_MODULES.map((m) => (
              <option key={m} value={m}>{MODULE_LABELS[m]}</option>
            ))}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="input w-36"
            title="從"
          />
          <span className="flex items-center text-gray-400 text-sm">至</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="input w-36"
            title="至"
          />
          <button
            onClick={() => { setOperatorFilter(''); setModuleFilter(''); setDateFrom(''); setDateTo(''); }}
            className="btn btn-secondary text-sm"
          >
            清除
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorCard message={error} onRetry={fetchActivity} />
      ) : (
        <div className="space-y-2">
          {items.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-sm">沒有符合條件的記錄</p>
            </div>
          ) : (
            items.map((item, idx) => (
              <div
                key={idx}
                className={`card flex items-center justify-between gap-4 ${item.is_voided ? 'opacity-50' : ''}`}
              >
                {/* Module badge */}
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${MODULE_COLORS[item.module] ?? 'bg-gray-100 text-gray-600'}`}>
                  {MODULE_LABELS[item.module] ?? item.module}
                </span>

                {/* Summary + operator */}
                <div className="flex-1 min-w-0">
                  {item.summary && (
                    <p className="text-sm font-medium text-gray-800 truncate">{item.summary}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-0.5">
                    <span className="font-medium text-gray-700">{item.operator_name ?? '—'}</span>
                    <span className="mx-1.5 text-gray-300">·</span>
                    {formatMelbourne(item.created_at)}
                  </p>
                </div>

                {/* Status badges */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {item.is_voided && (
                    <span className="flex items-center gap-1 text-xs text-red-600">
                      <XCircleIcon className="h-3.5 w-3.5" />已廢棄
                    </span>
                  )}
                  {!item.is_voided && item.is_locked && (
                    <span className="flex items-center gap-1 text-xs text-green-600">
                      <LockClosedIcon className="h-3.5 w-3.5" />已驗核
                    </span>
                  )}
                  {!item.is_voided && !item.is_locked && (
                    <span className="text-xs text-yellow-600 bg-yellow-50 px-1.5 py-0.5 rounded">填寫中</span>
                  )}

                  {/* Navigate to record */}
                  <button
                    onClick={() => navigate(recordUrl(item))}
                    className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700"
                    title="查看記錄"
                  >
                    <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}

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
