import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, PencilIcon } from '@heroicons/react/24/outline';
import { cookingLogsApi } from '@/api/cooking-logs';
import { CookingLog } from '@/types/cooking-log';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import StatusBadge from '@/components/StatusBadge';
import ALCOAAuditBar from '@/components/ALCOAAuditBar';
import ConfirmDialog from '@/components/ConfirmDialog';
import Bi, { bi } from '@/components/Bi';

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function CookingLogDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [log, setLog] = useState<CookingLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lockDialog, setLockDialog] = useState(false);
  const [voidDialog, setVoidDialog] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchLog = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await cookingLogsApi.get(Number(id));
      setLog(data);
    } catch {
      setError(bi('error.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchLog(); }, [fetchLog]);

  const handleLock = async () => {
    if (!log) return;
    setActionLoading(true);
    try {
      const updated = await cookingLogsApi.lock(log.id);
      setLog(updated);
      setLockDialog(false);
    } catch {
      alert(bi('error.updateFailed'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleVoid = async (reason?: string) => {
    if (!log || !reason) return;
    setActionLoading(true);
    try {
      const updated = await cookingLogsApi.void(log.id, { void_reason: reason });
      setLog(updated);
      setVoidDialog(false);
    } catch {
      alert(bi('error.updateFailed'));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <LoadingSpinner fullPage />;
  if (error || !log) return <ErrorCard message={error || bi('error.loadFailed')} onRetry={fetchLog} />;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/cooking-logs" className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeftIcon className="h-5 w-5 text-gray-500" /></Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-800">{log.batch_id}</h1>
              {log.ccp_status && <StatusBadge status={log.ccp_status} size="md" />}
            </div>
            <p className="text-sm text-gray-500"><Bi k="page.cooking.detail" /> #{log.id}</p>
          </div>
        </div>
        {!log.is_locked && !log.is_voided && (
          <Link to={`/cooking-logs/${log.id}/edit`} className="btn btn-secondary flex items-center gap-1.5">
            <PencilIcon className="h-4 w-4" />
            <Bi k="btn.edit" />
          </Link>
        )}
      </div>

      {/* ALCOA Audit Bar */}
      <ALCOAAuditBar
        operatorName={log.operator_name}
        verifierName={log.verifier_name}
        createdAt={log.created_at}
        isLocked={log.is_locked}
        isVoided={log.is_voided}
        voidReason={log.void_reason}
        voidedAt={log.voided_at}
        voidedBy={log.voided_by}
        onLock={() => setLockDialog(true)}
        onVoid={() => setVoidDialog(true)}
      />

      {/* Details */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-800 mb-4"><Bi k="section.recordDetail" /></h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><p className="text-xs text-gray-400"><Bi k="field.batchId" /></p><p className="font-medium">{log.batch_id}</p></div>
          <div><p className="text-xs text-gray-400"><Bi k="field.product" /></p><p className="font-medium">{log.product_name || `#${log.product_id}`}</p></div>
          <div><p className="text-xs text-gray-400"><Bi k="field.equipment" /></p><p className="font-medium">{log.equipment_name || '—'}</p></div>
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.coreTemp" /></p>
            <p className={`text-2xl font-bold ${log.ccp_status === 'Pass' ? 'text-green-600' : log.ccp_status === 'Fail' ? 'text-red-600' : 'text-gray-800'}`}>
              {log.core_temp ? `${log.core_temp}°C` : '—'}
            </p>
          </div>
          <div><p className="text-xs text-gray-400"><Bi k="field.startTime" /></p><p className="font-medium">{formatDateTime(log.start_time)}</p></div>
          <div><p className="text-xs text-gray-400"><Bi k="field.endTime" /></p><p className="font-medium">{formatDateTime(log.end_time)}</p></div>
        </div>

        {log.corrective_action && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-xs text-yellow-600 font-medium"><Bi k="field.correctiveAction" /></p>
            <p className="text-sm text-yellow-800 mt-1">{log.corrective_action}</p>
          </div>
        )}

        {log.notes && (
          <div className="mt-4">
            <p className="text-xs text-gray-400"><Bi k="field.notes" /></p>
            <p className="text-sm text-gray-600 mt-1">{log.notes}</p>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <ConfirmDialog open={lockDialog} title={bi('confirm.lock.title')} message={bi('confirm.lock.message')} variant="warning" confirmLabel={bi('confirm.void.confirm')} onConfirm={handleLock} onCancel={() => setLockDialog(false)} loading={actionLoading} />
      <ConfirmDialog open={voidDialog} title={bi('confirm.void.title')} message={bi('confirm.void.message')} variant="danger" confirmLabel={bi('confirm.void.confirm')} requireReason reasonLabel={bi('confirm.void.reason')} reasonMinLength={5} onConfirm={handleVoid} onCancel={() => setVoidDialog(false)} loading={actionLoading} />
    </div>
  );
}
