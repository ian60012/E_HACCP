import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PlusIcon } from '@heroicons/react/24/solid';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { coolingLogsApi } from '@/api/cooling-logs';
import { CoolingLog } from '@/types/cooling-log';
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
    timeZone: 'Australia/Melbourne', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function getStageLabel(log: CoolingLog): { zh: string; en: string; color: string } {
  if (log.end_temp) return { zh: '完成', en: 'Completed', color: 'text-green-600' };
  if (log.stage1_temp) {
    if (log.goes_to_freezer) return { zh: '完成 ❄️', en: 'Completed ❄️', color: 'text-cyan-600' };
    return { zh: '第二階段', en: 'Stage 2', color: 'text-blue-600' };
  }
  return { zh: '第一階段', en: 'Stage 1', color: 'text-orange-600' };
}

const exportColumns: ExportColumn<CoolingLog>[] = [
  { key: 'id', header: 'ID' },
  { key: 'batch_id', header: '批次號 Batch ID' },
  { key: 'start_temp', header: '起始溫度 Start Temp (°C)' },
  { key: 'stage1_temp', header: '第一階段溫度 Stage1 Temp (°C)' },
  { key: 'end_temp', header: '終點溫度 End Temp (°C)' },
  { key: 'total_duration_minutes', header: '總時長 Total Duration (min)' },
  { key: 'operator_name', header: '操作員 Operator' },
  { key: 'created_at', header: '建立時間 Created', format: formatExportDateTime },
];

export default function CoolingLogsPage() {
  const [logs, setLogs] = useState<CoolingLog[]>([]);
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
      const res = await coolingLogsApi.list({
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
      const res = await coolingLogsApi.list({ skip: 0, limit: 10000 });
      const dateStr = new Date().toISOString().slice(0, 10);
      if (type === 'excel') {
        exportToExcel(res.items, exportColumns, `cooling-logs-${dateStr}`);
      } else {
        exportToPdf(res.items, exportColumns, '冷卻記錄 Cooling Logs');
      }
    } catch (err) { console.error('Export failed:', err); alert(bi('error.exportFailed')); }
    finally { setExporting(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800"><Bi k="page.cooling.title" /></h1>
          <p className="text-sm text-gray-500 mt-1"><Bi k="page.cooling.subtitle" /></p>
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
          <Link to="/cooling-logs/new" className="btn btn-primary flex items-center gap-1.5">
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
        <EmptyState message={bi('empty.cooling')} actionLabel={bi('btn.createFirst')} actionTo="/cooling-logs/new" />
      ) : (
        <div className="space-y-2">
          {logs.map((log) => {
            const stage = getStageLabel(log);
            return (
              <div key={log.id} onClick={() => navigate(`/cooling-logs/${log.id}`)}
                className={`card cursor-pointer hover:shadow-lg transition-shadow ${log.is_voided ? 'opacity-50' : ''}`}>
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-800">{log.batch_id}</span>
                      <span className={`text-xs font-medium ${stage.color}`}><Bi label={{ zh: stage.zh, en: stage.en }} /></span>
                      {log.ccp_status && <StatusBadge status={log.ccp_status} />}
                      {log.is_voided && <StatusBadge status="Voided" />}
                      {log.is_locked && !log.is_voided && <StatusBadge status="Locked" />}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                      <span><Bi k="label.start" />: {log.start_temp}°C</span>
                      {log.stage1_temp && <span>→ <Bi k="label.stage1" />: {log.stage1_temp}°C</span>}
                      {log.end_temp && <span>→ <Bi k="label.end" />: {log.end_temp}°C</span>}
                      {log.total_duration_minutes && <span>({log.total_duration_minutes} <Bi k="label.minutes" />)</span>}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {log.operator_name || '—'}
                    </div>
                  </div>
                  <div className="text-xs text-gray-400 ml-4 whitespace-nowrap">{formatDateTime(log.created_at)}</div>
                </div>
              </div>
            );
          })}
          <Pagination currentPage={pagination.currentPage} totalPages={pagination.totalPages} total={pagination.total}
            hasNext={pagination.hasNext} hasPrev={pagination.hasPrev} onNext={pagination.nextPage} onPrev={pagination.prevPage} />
        </div>
      )}
    </div>
  );
}
