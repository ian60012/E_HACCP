import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeftIcon, ArrowTopRightOnSquareIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { deviationLogsApi } from '@/api/deviation-logs';
import { DeviationLog, DeviationCloseRequest } from '@/types/deviation-log';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import StatusBadge from '@/components/StatusBadge';
import ALCOAAuditBar from '@/components/ALCOAAuditBar';
import ConfirmDialog from '@/components/ConfirmDialog';
import FormField from '@/components/FormField';
import RoleGate from '@/components/RoleGate';
import Bi, { bi } from '@/components/Bi';

const sourceLabels: Record<string, string> = {
  receiving: bi('deviation.source.receiving'),
  cooking: bi('deviation.source.cooking'),
  cooling: bi('deviation.source.cooling'),
  sanitising: bi('deviation.source.sanitising'),
  assembly: '組裝包裝 Assembly & Packing',
};

const sourceRouteMap: Record<string, string> = {
  receiving: 'receiving-logs',
  cooking: 'cooking-logs',
  cooling: 'cooling-logs',
  sanitising: 'sanitising-logs',
};

const actionLabels: Record<string, string> = {
  Quarantine: bi('deviation.action.quarantine'),
  Hold: bi('deviation.action.hold'),
  Discard: bi('deviation.action.discard'),
  Rework: bi('deviation.action.rework'),
  Other: bi('deviation.action.other'),
};

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('zh-TW', {
    timeZone: 'Australia/Melbourne',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export default function DeviationLogDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [log, setLog] = useState<DeviationLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lockDialog, setLockDialog] = useState(false);
  const [voidDialog, setVoidDialog] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // CAPA Closure form state
  const [rootCause, setRootCause] = useState('');
  const [preventiveAction, setPreventiveAction] = useState('');
  const [closureNotes, setClosureNotes] = useState('');
  const [closeSubmitting, setCloseSubmitting] = useState(false);
  const [closeError, setCloseError] = useState('');

  // Validation
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const rootCauseError =
    touched.rootCause && rootCause.trim().length < 5
      ? bi('field.rootCause') + ' (min 5)'
      : '';
  const preventiveActionError =
    touched.preventiveAction && preventiveAction.trim().length < 5
      ? bi('field.preventiveAction') + ' (min 5)'
      : '';
  const canClose =
    rootCause.trim().length >= 5 && preventiveAction.trim().length >= 5;

  const fetchLog = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await deviationLogsApi.get(Number(id));
      setLog(data);
    } catch {
      setError(bi('error.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchLog();
  }, [fetchLog]);

  const handleLock = async () => {
    if (!log) return;
    setActionLoading(true);
    try {
      const updated = await deviationLogsApi.lock(log.id);
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
      const updated = await deviationLogsApi.void(log.id, { void_reason: reason });
      setLog(updated);
      setVoidDialog(false);
    } catch {
      alert(bi('error.updateFailed'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleClose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!log || !canClose) return;
    setCloseSubmitting(true);
    setCloseError('');
    try {
      const data: DeviationCloseRequest = {
        root_cause: rootCause.trim(),
        preventive_action: preventiveAction.trim(),
        closure_notes: closureNotes.trim() || undefined,
      };
      const updated = await deviationLogsApi.close(log.id, data);
      setLog(updated);
      setRootCause('');
      setPreventiveAction('');
      setClosureNotes('');
      setTouched({});
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail;
      setCloseError(detail || bi('error.updateFailed'));
    } finally {
      setCloseSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner fullPage />;
  if (error || !log)
    return <ErrorCard message={error || bi('error.loadFailed')} onRetry={fetchLog} />;

  const isOpen = !log.closed_at;
  const sourceRoute = sourceRouteMap[log.source_log_type];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/deviations"
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-800">
                <Bi k="page.deviation.detail" /> #{log.id}
              </h1>
              <StatusBadge status={log.severity} size="md" />
              <span className="text-sm bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full">
                {sourceLabels[log.source_log_type] || log.source_log_type}
              </span>
              <StatusBadge status={isOpen ? 'Open' : 'Closed'} size="md" />
              {log.is_voided && <StatusBadge status="Voided" size="md" />}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              <Bi k="page.deviation.subtitle" />
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

      {/* Source log link */}
      {sourceRoute && (
        <div className="card bg-blue-50 border border-blue-200">
          <Link
            to={`/${sourceRoute}/${log.source_log_id}`}
            className="flex items-center gap-2 text-blue-700 hover:text-blue-900 font-medium text-sm"
          >
            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            <Bi label={{ zh: '查看來源記錄', en: 'View Source Log' }} /> ({sourceLabels[log.source_log_type]} #{log.source_log_id}) &rarr;
          </Link>
        </div>
      )}

      {/* Deviation Details */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-800 mb-4"><Bi k="section.deviationDetail" /></h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <p className="text-xs text-gray-400"><Bi k="field.deviationDescription" /></p>
            <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">
              {log.description}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.severity" /></p>
            <div className="mt-1">
              <StatusBadge status={log.severity} />
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.immediateAction" /></p>
            <p className="font-medium mt-1">
              {actionLabels[log.immediate_action] || log.immediate_action}
            </p>
          </div>
          {log.immediate_action_detail && (
            <div className="sm:col-span-2">
              <p className="text-xs text-gray-400"><Bi k="field.immediateActionDetail" /></p>
              <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">
                {log.immediate_action_detail}
              </p>
            </div>
          )}
        </div>

        {log.notes && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400"><Bi k="field.notes" /></p>
            <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">
              {log.notes}
            </p>
          </div>
        )}
      </div>

      {/* Root Cause & Preventive Action (if filled) */}
      {(log.root_cause || log.preventive_action) && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">
            <Bi k="section.capaDetail" />
          </h2>
          <div className="space-y-4">
            {log.root_cause && (
              <div>
                <p className="text-xs text-gray-400"><Bi k="field.rootCause" /></p>
                <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">
                  {log.root_cause}
                </p>
              </div>
            )}
            {log.preventive_action && (
              <div>
                <p className="text-xs text-gray-400"><Bi k="field.preventiveAction" /></p>
                <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">
                  {log.preventive_action}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Closed Section */}
      {log.closed_at && (
        <div className="card bg-green-50 border border-green-200">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircleIcon className="h-5 w-5 text-green-600" />
            <h2 className="text-lg font-semibold text-green-800"><Bi k="section.closedSection" /></h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-green-600"><Bi k="field.closedBy" /></p>
              <p className="font-medium text-green-800">
                {log.closed_by ? `#${log.closed_by}` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-green-600"><Bi k="field.closedAt" /></p>
              <p className="font-medium text-green-800">
                {formatDateTime(log.closed_at)}
              </p>
            </div>
            {log.closure_notes && (
              <div className="sm:col-span-2">
                <p className="text-xs text-green-600"><Bi k="field.closureNotesLabel" /></p>
                <p className="text-green-800 mt-1 whitespace-pre-wrap">
                  {log.closure_notes}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CAPA Closure Form (only if open and not voided) */}
      {isOpen && !log.is_voided && (
        <RoleGate roles={['Admin', 'QA']}>
          <div className="card border-2 border-orange-200">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">
              <Bi k="section.capaClose" />
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              <Bi label={{ zh: '填寫根本原因與預防措施以關閉此偏差記錄', en: 'Fill in root cause and preventive action to close this deviation' }} />
            </p>

            {closeError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-4">
                {closeError}
              </div>
            )}

            <form onSubmit={handleClose} className="space-y-4">
              <FormField
                label={bi('field.rootCause')}
                required
                error={rootCauseError}
              >
                <textarea
                  value={rootCause}
                  onChange={(e) => setRootCause(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, rootCause: true }))}
                  className="input min-h-[80px]"
                  placeholder={bi('hint.deviationDesc')}
                  required
                  minLength={5}
                />
              </FormField>

              <FormField
                label={bi('field.preventiveAction')}
                required
                error={preventiveActionError}
              >
                <textarea
                  value={preventiveAction}
                  onChange={(e) => setPreventiveAction(e.target.value)}
                  onBlur={() =>
                    setTouched((t) => ({ ...t, preventiveAction: true }))
                  }
                  className="input min-h-[80px]"
                  placeholder={bi('hint.actionDetail')}
                  required
                  minLength={5}
                />
              </FormField>

              <FormField label={bi('field.closureNotes')}>
                <textarea
                  value={closureNotes}
                  onChange={(e) => setClosureNotes(e.target.value)}
                  className="input min-h-[60px]"
                  placeholder={bi('hint.notesOptional')}
                />
              </FormField>

              <div className="flex items-center gap-3 pt-4 border-t">
                <button
                  type="submit"
                  disabled={closeSubmitting || !canClose}
                  className="btn btn-primary flex items-center gap-1.5"
                >
                  <CheckCircleIcon className="h-4 w-4" />
                  {closeSubmitting ? bi('btn.saving') : bi('btn.closeDeviation')}
                </button>
              </div>
            </form>
          </div>
        </RoleGate>
      )}

      {/* Dialogs */}
      <ConfirmDialog
        open={lockDialog}
        title={bi('confirm.lock.title')}
        message={bi('confirm.lock.message')}
        variant="warning"
        confirmLabel={bi('confirm.lock.confirm')}
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
