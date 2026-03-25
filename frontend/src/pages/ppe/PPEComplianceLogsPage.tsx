import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PlusIcon } from '@heroicons/react/24/solid';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { ppeComplianceLogsApi } from '@/api/ppe-compliance-logs';
import { PPEComplianceLog } from '@/types/ppe-compliance-log';
import { usePagination } from '@/hooks/usePagination';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import EmptyState from '@/components/EmptyState';
import StatusBadge from '@/components/StatusBadge';
import Pagination from '@/components/Pagination';
import Bi, { bi } from '@/components/Bi';
import RoleGate from '@/components/RoleGate';
import { exportToExcel, exportToPdf, ExportColumn, formatExportDateTime } from '@/utils/export';

const PPE_ITEMS = [
  'hair_net', 'beard_net', 'clean_uniform', 'no_nail_polish',
  'safety_shoes', 'single_use_mask', 'no_jewellery', 'hand_hygiene', 'gloves',
] as const;

function countFails(log: PPEComplianceLog): number {
  return PPE_ITEMS.filter(k => log[k] === 'Fail').length;
}

const exportColumns: ExportColumn<PPEComplianceLog>[] = [
  { key: 'id', header: 'ID' },
  { key: 'check_date', header: '檢查日期 Date' },
  { key: 'area_name', header: '區域 Area' },
  { key: 'staff_count', header: '人數 Staff' },
  { key: 'operator_name', header: 'QA' },
  { key: 'created_at', header: '建立時間 Created', format: formatExportDateTime },
];

export default function PPEComplianceLogsPage() {
  const [logs, setLogs] = useState<PPEComplianceLog[]>([]);
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
      const res = await ppeComplianceLogsApi.list({
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
      const res = await ppeComplianceLogsApi.list({ skip: 0, limit: 10000 });
      const dateStr = new Date().toISOString().slice(0, 10);
      if (type === 'excel') {
        exportToExcel(res.items, exportColumns, `ppe-compliance-logs-${dateStr}`);
      } else {
        exportToPdf(res.items, exportColumns, 'PPE合規檢查 PPE Compliance Logs');
      }
    } catch (err) { console.error('Export failed:', err); alert(bi('error.exportFailed')); }
    finally { setExporting(false); }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800"><Bi k="page.ppe.title" /></h1>
          <p className="text-sm text-gray-500 mt-1"><Bi k="page.ppe.subtitle" /></p>
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
          <RoleGate roles={['Admin', 'QA', 'Production']}>
            <Link
              to="/ppe-compliance-logs/new"
              className="btn btn-primary flex items-center gap-1.5"
            >
              <PlusIcon className="h-5 w-5" />
              <span className="hidden sm:inline"><Bi k="btn.newRecord" /></span>
            </Link>
          </RoleGate>
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
          message={bi('empty.ppe')}
          actionLabel={bi('btn.createFirst')}
          actionTo="/ppe-compliance-logs/new"
        />
      ) : (
        <div className="space-y-2">
          {logs.map((log) => {
            const fails = countFails(log);
            return (
              <div
                key={log.id}
                onClick={() => navigate(`/ppe-compliance-logs/${log.id}`)}
                className={`card cursor-pointer hover:shadow-lg transition-shadow ${
                  log.is_voided ? 'opacity-50' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-800">
                        {log.area_name || `#${log.area_id}`}
                      </span>
                      <span className="text-sm text-gray-500">{log.check_date}</span>
                      {fails === 0 ? (
                        <StatusBadge status="Pass" />
                      ) : (
                        <StatusBadge status="Fail" />
                      )}
                      {log.is_voided && <StatusBadge status="Voided" />}
                      {log.is_locked && !log.is_voided && <StatusBadge status="Locked" />}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 flex-wrap">
                      <span>{log.staff_count} staff</span>
                      {fails > 0 && (
                        <span className="text-red-500 font-medium">{fails} item(s) failed</span>
                      )}
                      {log.capa_no && <span>CAPA: {log.capa_no}</span>}
                    </div>
                  </div>
                  <div className="text-xs text-gray-400 ml-4 whitespace-nowrap">
                    {log.operator_name}
                  </div>
                </div>
              </div>
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
