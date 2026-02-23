import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PlusIcon } from '@heroicons/react/24/solid';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { assemblyLogsApi } from '@/api/assembly-logs';
import { AssemblyLog } from '@/types/assembly-log';
import { usePagination } from '@/hooks/usePagination';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import EmptyState from '@/components/EmptyState';
import StatusBadge from '@/components/StatusBadge';
import Pagination from '@/components/Pagination';
import Bi, { bi } from '@/components/Bi';
import { exportToExcel, exportToPdf, ExportColumn, formatExportDateTime } from '@/utils/export';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

const exportColumns: ExportColumn<AssemblyLog>[] = [
  { key: 'id', header: 'ID' },
  { key: 'batch_id', header: '批次號 Batch ID' },
  { key: 'product_name', header: '產品 Product' },
  { key: 'average_weight_g', header: '平均重量 Avg Weight (g)' },
  { key: 'is_allergen_declared', header: '過敏原 Allergen', format: (v) => v ? '是 Yes' : '否 No' },
  { key: 'seal_integrity', header: '封口 Seal' },
  { key: 'operator_name', header: '操作員 Operator' },
  { key: 'created_at', header: '建立時間 Created', format: formatExportDateTime },
];

export default function AssemblyLogsPage() {
  const [logs, setLogs] = useState<AssemblyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showVoided, setShowVoided] = useState(false);
  const [exporting, setExporting] = useState(false);
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

  const handleExport = async (type: 'excel' | 'pdf') => {
    setExporting(true);
    try {
      const res = await assemblyLogsApi.list({ skip: 0, limit: 10000 });
      const dateStr = new Date().toISOString().slice(0, 10);
      if (type === 'excel') {
        exportToExcel(res.items, exportColumns, `assembly-logs-${dateStr}`);
      } else {
        exportToPdf(res.items, exportColumns, '組裝包裝記錄 Assembly Logs');
      }
    } catch (err) { console.error('Export failed:', err); alert(bi('error.exportFailed')); }
    finally { setExporting(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800"><Bi k="page.assembly.title" /></h1>
          <p className="text-sm text-gray-500 mt-1"><Bi k="page.assembly.subtitle" /></p>
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
          <Link to="/assembly-logs/new" className="btn btn-primary flex items-center gap-1.5">
            <PlusIcon className="h-5 w-5" />
            <span className="hidden sm:inline"><Bi k="btn.newRecord" /></span>
          </Link>
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
        <EmptyState message={bi('empty.assembly')} actionLabel={bi('btn.createFirst')} actionTo="/assembly-logs/new" />
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} onClick={() => navigate(`/assembly-logs/${log.id}`)}
              className={`card cursor-pointer hover:shadow-lg transition-shadow ${log.is_voided ? 'opacity-50' : ''}`}>
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-800">{log.batch_id}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      log.is_allergen_declared
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      <Bi k="label.allergen" /> {log.is_allergen_declared ? '✓' : '✗'}
                    </span>
                    {log.warnings && log.warnings.length > 0 && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                        {log.warnings.length} <Bi k="label.warnings" />
                      </span>
                    )}
                    {log.is_voided && <StatusBadge status="Voided" />}
                    {log.is_locked && !log.is_voided && <StatusBadge status="Locked" />}
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                    <span>{log.product_name || `${bi('field.product')} #${log.product_id}`}</span>
                    {log.average_weight_g && (
                      <span className="font-medium text-gray-600">
                        <Bi k="label.average" />: {log.average_weight_g}g
                      </span>
                    )}
                    <span>{log.operator_name || '—'}</span>
                  </div>
                </div>
                <div className="text-xs text-gray-400 ml-4 whitespace-nowrap">{formatDateTime(log.created_at)}</div>
              </div>
            </div>
          ))}
          <Pagination currentPage={pagination.currentPage} totalPages={pagination.totalPages} total={pagination.total}
            hasNext={pagination.hasNext} hasPrev={pagination.hasPrev} onNext={pagination.nextPage} onPrev={pagination.prevPage} />
        </div>
      )}
    </div>
  );
}
