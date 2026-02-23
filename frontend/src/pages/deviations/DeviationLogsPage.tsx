import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PlusIcon } from '@heroicons/react/24/solid';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { deviationLogsApi } from '@/api/deviation-logs';
import { DeviationLog } from '@/types/deviation-log';
import { usePagination } from '@/hooks/usePagination';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import EmptyState from '@/components/EmptyState';
import StatusBadge from '@/components/StatusBadge';
import Pagination from '@/components/Pagination';
import Bi, { bi } from '@/components/Bi';
import { exportToExcel, exportToPdf, ExportColumn, formatExportDateTime } from '@/utils/export';

const sourceLabels: Record<string, { zh: string; en: string }> = {
  receiving: { zh: '收貨', en: 'Receiving' },
  cooking: { zh: '烹飪', en: 'Cooking' },
  cooling: { zh: '冷卻', en: 'Cooling' },
  sanitising: { zh: '清潔', en: 'Sanitising' },
  assembly: { zh: '組裝', en: 'Assembly' },
};

const actionLabels: Record<string, { zh: string; en: string }> = {
  Quarantine: { zh: '隔離', en: 'Quarantine' },
  Hold: { zh: '保留', en: 'Hold' },
  Discard: { zh: '丟棄', en: 'Discard' },
  Rework: { zh: '返工', en: 'Rework' },
  Other: { zh: '其他', en: 'Other' },
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const exportColumns: ExportColumn<DeviationLog>[] = [
  { key: 'id', header: 'ID' },
  { key: 'source_log_type', header: '來源 Source' },
  { key: 'severity', header: '嚴重度 Severity' },
  { key: 'immediate_action', header: '立即措施 Action' },
  { key: 'description', header: '描述 Description' },
  { key: 'closed_at', header: '已結案 Closed', format: (v) => v ? '是 Yes' : '否 No' },
  { key: 'operator_name', header: '操作員 Operator' },
  { key: 'created_at', header: '建立時間 Created', format: formatExportDateTime },
];

export default function DeviationLogsPage() {
  const [logs, setLogs] = useState<DeviationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [filterType, setFilterType] = useState<string>('');
  const [filterSeverity, setFilterSeverity] = useState<string>('');
  const [filterOpen, setFilterOpen] = useState<boolean | undefined>(true);
  const pagination = usePagination(20);
  const navigate = useNavigate();

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, unknown> = {
        skip: pagination.skip,
        limit: pagination.limit,
      };
      if (filterType) params.source_log_type = filterType;
      if (filterSeverity) params.severity = filterSeverity;
      if (filterOpen !== undefined) params.is_open = filterOpen;
      const res = await deviationLogsApi.list(
        params as Parameters<typeof deviationLogsApi.list>[0]
      );
      setLogs(res.items);
      pagination.setTotal(res.total);
    } catch {
      setError(bi('error.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [pagination.skip, pagination.limit, filterType, filterSeverity, filterOpen]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleExport = async (type: 'excel' | 'pdf') => {
    setExporting(true);
    try {
      const res = await deviationLogsApi.list({ skip: 0, limit: 10000 });
      const dateStr = new Date().toISOString().slice(0, 10);
      if (type === 'excel') {
        exportToExcel(res.items, exportColumns, `deviation-logs-${dateStr}`);
      } else {
        exportToPdf(res.items, exportColumns, '偏差記錄 Deviation Logs');
      }
    } catch (err) { console.error('Export failed:', err); alert(bi('error.exportFailed')); }
    finally { setExporting(false); }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800"><Bi k="page.deviation.title" /></h1>
          <p className="text-sm text-gray-500 mt-1"><Bi k="page.deviation.subtitle" /></p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => handleExport('excel')} disabled={exporting}
            className="btn btn-secondary text-sm flex items-center gap-1.5">
            <ArrowDownTrayIcon className="h-4 w-4" /><Bi k="btn.exportExcel" />
          </button>
          <button onClick={() => handleExport('pdf')} disabled={exporting}
            className="btn btn-secondary text-sm flex items-center gap-1.5">
            <ArrowDownTrayIcon className="h-4 w-4" /><Bi k="btn.exportPdf" />
          </button>
          <Link
            to="/deviations/new"
            className="btn btn-primary flex items-center gap-1.5"
          >
            <PlusIcon className="h-5 w-5" />
            <span className="hidden sm:inline"><Bi k="btn.newDeviation" /></span>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="input w-auto text-sm"
        >
          <option value="">{bi('filter.allSources')}</option>
          <option value="receiving">{bi('filter.source.receiving')}</option>
          <option value="cooking">{bi('filter.source.cooking')}</option>
          <option value="cooling">{bi('filter.source.cooling')}</option>
          <option value="sanitising">{bi('filter.source.sanitising')}</option>
          <option value="assembly">{bi('filter.source.assembly')}</option>
        </select>

        <select
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value)}
          className="input w-auto text-sm"
        >
          <option value="">{bi('filter.allSeverity')}</option>
          <option value="Critical">{bi('status.critical')}</option>
          <option value="Major">{bi('status.major')}</option>
          <option value="Minor">{bi('status.minor')}</option>
        </select>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterOpen(true)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              filterOpen === true
                ? 'bg-primary-100 text-primary-700'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            <Bi k="filter.open" />
          </button>
          <button
            onClick={() => setFilterOpen(false)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              filterOpen === false
                ? 'bg-gray-300 text-gray-700'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            <Bi k="filter.closed" />
          </button>
          <button
            onClick={() => setFilterOpen(undefined)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              filterOpen === undefined
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            <Bi k="filter.all" />
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorCard message={error} onRetry={fetchLogs} />
      ) : logs.length === 0 ? (
        <EmptyState
          title={bi('empty.deviation')}
          message={bi('filter.noMatch')}
          actionLabel={bi('btn.newDeviation')}
          actionTo="/deviations/new"
        />
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div
              key={log.id}
              onClick={() => navigate(`/deviations/${log.id}`)}
              className={`card cursor-pointer hover:shadow-lg transition-shadow ${
                log.is_voided ? 'opacity-50' : ''
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status={log.severity} />
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      {sourceLabels[log.source_log_type]
                        ? <Bi label={sourceLabels[log.source_log_type]} />
                        : log.source_log_type}
                    </span>
                    <StatusBadge status={log.closed_at ? 'Closed' : 'Open'} />
                    {log.is_voided && <StatusBadge status="Voided" />}
                  </div>
                  <p className="mt-1 text-sm text-gray-700">
                    {log.description.length > 100
                      ? log.description.slice(0, 100) + '...'
                      : log.description}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                    <span>
                      <Bi k="label.action" />: {actionLabels[log.immediate_action]
                        ? <Bi label={actionLabels[log.immediate_action]} />
                        : log.immediate_action}
                    </span>
                    <span>{log.operator_name}</span>
                  </div>
                </div>
                <div className="text-xs text-gray-400 ml-4 whitespace-nowrap">
                  {formatDateTime(log.created_at)}
                </div>
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
