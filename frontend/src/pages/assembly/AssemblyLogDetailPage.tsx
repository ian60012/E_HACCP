import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { assemblyLogsApi } from '@/api/assembly-logs';
import { AssemblyPackingLog } from '@/types/assembly-log';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import StatusBadge from '@/components/StatusBadge';
import ALCOAAuditBar from '@/components/ALCOAAuditBar';
import ConfirmDialog from '@/components/ConfirmDialog';
import Bi, { bi } from '@/components/Bi';

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('zh-TW', {
    timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function PassFailBadge({ value }: { value: 'Pass' | 'Fail' | null }) {
  if (!value) return <span className="text-gray-400">—</span>;
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${value === 'Pass' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      {value}
    </span>
  );
}

export default function AssemblyLogDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [log, setLog] = useState<AssemblyPackingLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lockDialog, setLockDialog] = useState(false);
  const [voidDialog, setVoidDialog] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchLog = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await assemblyLogsApi.get(Number(id));
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
      const updated = await assemblyLogsApi.lock(log.id);
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
      const updated = await assemblyLogsApi.void(log.id, { void_reason: reason });
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

  const weights = [log.sample_1_g, log.sample_2_g, log.sample_3_g, log.sample_4_g, log.sample_5_g].filter(Boolean);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/assembly-logs" className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-800">組裝包裝 #{log.id}</h1>
              {log.is_voided && <StatusBadge status="Voided" size="md" />}
              {log.is_locked && !log.is_voided && <StatusBadge status="Locked" size="md" />}
            </div>
            <p className="text-sm text-gray-500">
              批次 <button onClick={() => navigate(`/production/batches/${log.prod_batch_id}`)} className="text-blue-600 hover:underline">{log.prod_batch_code ?? `#${log.prod_batch_id}`}</button>
              {' · '}建立於 {formatDateTime(log.created_at)}
            </p>
          </div>
        </div>
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

      {/* Main info card */}
      <div className="card space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">標籤與封口查驗</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-gray-400">過敏原聲明 Allergen Declared</p>
            <span className={`inline-flex mt-1 px-3 py-1 rounded-full text-sm font-medium ${log.is_allergen_declared ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {log.is_allergen_declared ? '已聲明 ✓' : '未聲明 ✗'}
            </span>
          </div>
          <div>
            <p className="text-xs text-gray-400">日期碼正確 Date Code</p>
            <p className="mt-1">
              {log.is_date_code_correct === null ? (
                <span className="text-gray-400">—</span>
              ) : (
                <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${log.is_date_code_correct ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {log.is_date_code_correct ? '正確 ✓' : '錯誤 ✗'}
                </span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400">封口完整性 Seal Integrity</p>
            <p className="mt-1"><PassFailBadge value={log.seal_integrity} /></p>
          </div>
          <div>
            <p className="text-xs text-gray-400">編碼清晰度 Coding Legibility</p>
            <p className="mt-1"><PassFailBadge value={log.coding_legibility} /></p>
          </div>
        </div>
      </div>

      {/* Weight samples */}
      {(log.target_weight_g || weights.length > 0) && (
        <div className="card space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">重量抽檢 Weight Sampling</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {log.target_weight_g && (
              <div>
                <p className="text-xs text-gray-400">目標重量 Target (g)</p>
                <p className="text-lg font-bold text-gray-800">{log.target_weight_g}g</p>
              </div>
            )}
            {[1, 2, 3, 4, 5].map((n) => {
              const val = (log as any)[`sample_${n}_g`];
              return val ? (
                <div key={n}>
                  <p className="text-xs text-gray-400">樣本 {n}</p>
                  <p className="text-lg font-bold text-gray-800">{val}g</p>
                </div>
              ) : null;
            })}
            {log.average_weight_g && (
              <div className="col-span-2 sm:col-span-1">
                <p className="text-xs text-gray-400">平均重量 Average (g)</p>
                <p className="text-xl font-bold text-blue-700">{log.average_weight_g}g</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Corrective action / notes */}
      {(log.corrective_action || log.notes) && (
        <div className="card space-y-3">
          {log.corrective_action && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-xs text-yellow-600 font-medium"><Bi k="field.correctiveAction" /></p>
              <p className="text-sm text-yellow-800 mt-1">{log.corrective_action}</p>
            </div>
          )}
          {log.notes && (
            <div>
              <p className="text-xs text-gray-400"><Bi k="field.notes" /></p>
              <p className="text-sm text-gray-600 mt-1">{log.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Dialogs */}
      <ConfirmDialog
        open={lockDialog}
        title={bi('confirm.lock.title')}
        message={bi('confirm.lock.message')}
        variant="warning"
        confirmLabel={bi('confirm.void.confirm')}
        onConfirm={handleLock}
        onCancel={() => setLockDialog(false)}
        loading={actionLoading}
      />
      <ConfirmDialog
        open={voidDialog}
        title={bi('confirm.void.title')}
        message={bi('confirm.void.message')}
        variant="danger"
        confirmLabel={bi('confirm.void.confirm')}
        requireReason
        reasonLabel={bi('confirm.void.reason')}
        reasonMinLength={5}
        onConfirm={handleVoid}
        onCancel={() => setVoidDialog(false)}
        loading={actionLoading}
      />
    </div>
  );
}
