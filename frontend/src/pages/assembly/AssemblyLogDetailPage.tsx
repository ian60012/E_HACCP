import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeftIcon, PencilIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon, XCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import { assemblyLogsApi } from '@/api/assembly-logs';
import { AssemblyLog } from '@/types/assembly-log';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import StatusBadge from '@/components/StatusBadge';
import ALCOAAuditBar from '@/components/ALCOAAuditBar';
import ConfirmDialog from '@/components/ConfirmDialog';
import Bi, { bi } from '@/components/Bi';

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('zh-TW', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function BoolBadge({ value, trueLabel, falseLabel }: { value: boolean | null; trueLabel: string; falseLabel: string }) {
  if (value === null || value === undefined) {
    return <span className="text-sm text-gray-400">—</span>;
  }
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-medium ${value ? 'text-green-700' : 'text-red-700'}`}>
      {value ? <CheckCircleIcon className="h-4 w-4 text-green-500" /> : <XCircleIcon className="h-4 w-4 text-red-500" />}
      {value ? trueLabel : falseLabel}
    </span>
  );
}

function PassFailBadge({ value }: { value: 'Pass' | 'Fail' | null }) {
  if (!value) return <span className="text-sm text-gray-400">—</span>;
  return <StatusBadge status={value} size="md" />;
}

export default function AssemblyLogDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [log, setLog] = useState<AssemblyLog | null>(null);
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

  const sampleWeights = [
    { label: `${bi('misc.sample')} 1`, value: log.sample_1_g },
    { label: `${bi('misc.sample')} 2`, value: log.sample_2_g },
    { label: `${bi('misc.sample')} 3`, value: log.sample_3_g },
    { label: `${bi('misc.sample')} 4`, value: log.sample_4_g },
    { label: `${bi('misc.sample')} 5`, value: log.sample_5_g },
  ];

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
              <h1 className="text-2xl font-bold text-gray-800">{log.batch_id}</h1>
            </div>
            <p className="text-sm text-gray-500"><Bi k="page.assembly.detail" /> #{log.id}</p>
          </div>
        </div>
        {!log.is_locked && !log.is_voided && (
          <Link to={`/assembly-logs/${log.id}/edit`} className="btn btn-secondary flex items-center gap-1.5">
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

      {/* Basic Info */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-800 mb-4"><Bi k="section.basicInfo" /></h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.batchId" /></p>
            <p className="font-medium">{log.batch_id}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.product" /></p>
            <p className="font-medium">{log.product_name || `#${log.product_id}`}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.allergenMarked" /></p>
            <BoolBadge value={log.is_allergen_declared} trueLabel={bi('misc.yes')} falseLabel={bi('misc.no')} />
          </div>
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.dateCodeMarked" /></p>
            <BoolBadge value={log.is_date_code_correct} trueLabel={bi('misc.yes')} falseLabel={bi('misc.no')} />
          </div>
        </div>
      </div>

      {/* Sample Weights */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-800 mb-4"><Bi k="section.weightTest" /></h2>

        {/* Average weight - prominently displayed */}
        <div className="text-center mb-4 p-4 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-400 mb-1"><Bi k="field.averageWeight" /></p>
          <p className="text-3xl font-bold text-gray-800">
            {log.average_weight_g ? `${log.average_weight_g} g` : '—'}
          </p>
          {log.target_weight_g && (
            <p className="text-sm text-gray-500 mt-1">
              {bi('misc.targetWeight')}: {log.target_weight_g} g
            </p>
          )}
        </div>

        {/* 5 sample weights grid */}
        <div className="grid grid-cols-5 gap-2">
          {sampleWeights.map((sample) => (
            <div key={sample.label} className="text-center p-3 bg-white border border-gray-200 rounded-lg">
              <p className="text-xs text-gray-400">{sample.label}</p>
              <p className="text-lg font-semibold text-gray-700 mt-1">
                {sample.value ? `${sample.value}` : '—'}
              </p>
              {sample.value && <p className="text-xs text-gray-400">g</p>}
            </div>
          ))}
        </div>
      </div>

      {/* Quality Checks */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-800 mb-4"><Bi k="section.qualityCheck" /></h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.sealIntegrity" /></p>
            <div className="mt-1">
              <PassFailBadge value={log.seal_integrity} />
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.codingLegibility" /></p>
            <div className="mt-1">
              <PassFailBadge value={log.coding_legibility} />
            </div>
          </div>
        </div>
      </div>

      {/* Warnings */}
      {log.warnings && log.warnings.length > 0 && (
        <div className="card border-yellow-200 bg-yellow-50">
          <div className="flex items-center gap-2 mb-3">
            <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600" />
            <h2 className="text-lg font-semibold text-yellow-800"><Bi label={{ zh: '警告', en: 'Warnings' }} /> ({log.warnings.length})</h2>
          </div>
          <ul className="space-y-2">
            {log.warnings.map((warning, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-yellow-800">
                <span className="text-yellow-500 mt-0.5">&#8226;</span>
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Corrective Action & Notes */}
      {log.corrective_action && (
        <div className="card bg-yellow-50 border-yellow-200">
          <p className="text-xs text-yellow-600 font-medium"><Bi k="field.correctiveAction" /></p>
          <p className="text-sm text-yellow-800 mt-1">{log.corrective_action}</p>
        </div>
      )}

      {log.notes && (
        <div className="card">
          <p className="text-xs text-gray-400"><Bi k="field.notes" /></p>
          <p className="text-sm text-gray-600 mt-1">{log.notes}</p>
        </div>
      )}

      {/* Dialogs */}
      <ConfirmDialog open={lockDialog} title={bi('confirm.lock.title')} message={bi('confirm.lock.message')} variant="warning" confirmLabel={bi('confirm.void.confirm')} onConfirm={handleLock} onCancel={() => setLockDialog(false)} loading={actionLoading} />
      <ConfirmDialog open={voidDialog} title={bi('confirm.void.title')} message={bi('confirm.void.message')} variant="danger" confirmLabel={bi('confirm.void.confirm')} requireReason reasonLabel={bi('confirm.void.reason')} reasonMinLength={5} onConfirm={handleVoid} onCancel={() => setVoidDialog(false)} loading={actionLoading} />
    </div>
  );
}
