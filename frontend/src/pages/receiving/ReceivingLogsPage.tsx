import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PlusIcon } from '@heroicons/react/24/solid';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { receivingLogsApi } from '@/api/receiving-logs';
import { ReceivingLog } from '@/types/receiving-log';
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
    timeZone: 'Australia/Melbourne',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

const exportColumns: ExportColumn<ReceivingLog>[] = [
  { key: 'id', header: 'ID' },
  { key: 'po_number', header: '採購單號 PO Number' },
  { key: 'supplier_name', header: '供應商 Supplier' },
  { key: 'product_name', header: '產品 Product' },
  { key: 'temp_chilled', header: '冷藏溫度 Chilled Temp (°C)' },
  { key: 'temp_frozen', header: '冷凍溫度 Frozen Temp (°C)' },
  { key: 'vehicle_cleanliness', header: '車輛清潔 Vehicle Clean' },
  { key: 'packaging_integrity', header: '包裝完整 Packaging' },
  { key: 'acceptance_status', header: '驗收 Acceptance' },
  { key: 'operator_name', header: '操作員 Operator' },
  { key: 'created_at', header: '建立時間 Created', format: formatExportDateTime },
];

export default function ReceivingLogsPage() {
  const [logs, setLogs] = useState<ReceivingLog[]>([]);
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
      const res = await receivingLogsApi.list({
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

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleExport = async (type: 'excel' | 'pdf') => {
    setExporting(true);
    try {
      const res = await receivingLogsApi.list({ skip: 0, limit: 10000 });
      const dateStr = new Date().toISOString().slice(0, 10);
      if (type === 'excel') {
        exportToExcel(res.items, exportColumns, `receiving-logs-${dateStr}`);
      } else {
        exportToPdf(res.items, exportColumns, '收貨記錄 Receiving Logs');
      }
    } catch (err) { console.error('Export failed:', err); alert(bi('error.exportFailed')); }
    finally { setExporting(false); }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800"><Bi k="page.receiving.title" /></h1>
          <p className="text-sm text-gray-500 mt-1"><Bi k="page.receiving.subtitle" /></p>
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
            to="/receiving-logs/new"
            className="btn btn-primary flex items-center gap-1.5"
          >
            <PlusIcon className="h-5 w-5" />
            <span className="hidden sm:inline"><Bi k="btn.newRecord" /></span>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={showVoided}
            onChange={(e) => setShowVoided(e.target.checked)}
            className="rounded border-gray-300"
          />
          <Bi k="btn.showVoided" />
        </label>
      </div>

      {/* Content */}
      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorCard message={error} onRetry={fetchLogs} />
      ) : logs.length === 0 ? (
        <EmptyState
          message={bi('empty.receiving')}
          actionLabel={bi('btn.createFirst')}
          actionTo="/receiving-logs/new"
        />
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div
              key={log.id}
              onClick={() => navigate(`/receiving-logs/${log.id}`)}
              className={`card cursor-pointer hover:shadow-lg transition-shadow ${
                log.is_voided ? 'opacity-50' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-800">
                      {log.po_number || `#${log.id}`}
                    </span>
                    <span className="text-sm text-gray-500">
                      {log.supplier_name || `${bi('field.supplier')} #${log.supplier_id}`}
                    </span>
                    <StatusBadge status={log.acceptance_status} />
                    {log.is_voided && <StatusBadge status="Voided" />}
                    {log.is_locked && !log.is_voided && (
                      <StatusBadge status="Locked" />
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 flex-wrap">
                    {log.product_name && <span>{log.product_name}</span>}
                    {log.temp_chilled && (
                      <span><Bi k="label.chilled" />: {log.temp_chilled}°C</span>
                    )}
                    {log.temp_frozen && (
                      <span><Bi k="label.frozen" />: {log.temp_frozen}°C</span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Bi k="label.vehicleClean" />: <StatusBadge status={log.vehicle_cleanliness} />
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Bi k="label.packagingOk" />: <StatusBadge status={log.packaging_integrity} />
                    </span>
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
