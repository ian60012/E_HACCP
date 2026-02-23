import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, PencilIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import { coolingLogsApi } from '@/api/cooling-logs';
import { CoolingLog } from '@/types/cooling-log';
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

/** 3-stage visual step indicator */
function StageProgress({ log }: { log: CoolingLog }) {
  const hasStage1 = log.stage1_temp !== null;
  const hasEnd = log.end_temp !== null;

  const stages = log.goes_to_freezer
    ? [
        { label: bi('label.start'), completed: true, temp: `${log.start_temp}°C`, time: formatDateTime(log.start_time) },
        { label: bi('label.stage1'), completed: hasStage1, temp: hasStage1 ? `${log.stage1_temp}°C` : '—', time: formatDateTime(log.stage1_time) },
      ]
    : [
        { label: bi('label.start'), completed: true, temp: `${log.start_temp}°C`, time: formatDateTime(log.start_time) },
        { label: bi('label.stage1'), completed: hasStage1, temp: hasStage1 ? `${log.stage1_temp}°C` : '—', time: formatDateTime(log.stage1_time) },
        { label: bi('label.end'), completed: hasEnd, temp: hasEnd ? `${log.end_temp}°C` : '—', time: formatDateTime(log.end_time) },
      ];

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800"><Bi k="section.coolingProgress" /></h2>
        {log.goes_to_freezer && (
          <span className="text-xs bg-cyan-100 text-cyan-700 px-2 py-1 rounded-full font-medium">
            ❄️ <Bi k="label.freezerMode" />
          </span>
        )}
      </div>
      <div className="flex items-center justify-between">
        {stages.map((stage, i) => (
          <div key={stage.label} className="flex items-center flex-1">
            {/* Step circle */}
            <div className="flex flex-col items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                stage.completed
                  ? 'bg-green-100 border-green-500'
                  : 'bg-gray-100 border-gray-300'
              }`}>
                {stage.completed ? (
                  <CheckCircleIcon className="h-6 w-6 text-green-500" />
                ) : (
                  <span className="text-sm font-medium text-gray-400">{i + 1}</span>
                )}
              </div>
              <p className={`text-xs mt-1 font-medium ${stage.completed ? 'text-green-700' : 'text-gray-400'}`}>
                {stage.label}
              </p>
              <p className={`text-sm font-bold ${stage.completed ? 'text-gray-800' : 'text-gray-300'}`}>
                {stage.temp}
              </p>
              <p className="text-xs text-gray-400">{stage.time}</p>
            </div>
            {/* Connector line (not after last) */}
            {i < stages.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 ${
                stages[i + 1].completed ? 'bg-green-400' : 'bg-gray-200'
              }`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CoolingLogDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [log, setLog] = useState<CoolingLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lockDialog, setLockDialog] = useState(false);
  const [voidDialog, setVoidDialog] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchLog = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await coolingLogsApi.get(Number(id));
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
      const updated = await coolingLogsApi.lock(log.id);
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
      const updated = await coolingLogsApi.void(log.id, { void_reason: reason });
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
          <Link to="/cooling-logs" className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-800">{log.batch_id}</h1>
              {log.ccp_status && <StatusBadge status={log.ccp_status} size="md" />}
            </div>
            <p className="text-sm text-gray-500"><Bi k="page.cooling.detail" /> #{log.id}</p>
          </div>
        </div>
        {!log.is_locked && !log.is_voided && (
          <Link to={`/cooling-logs/${log.id}/edit`} className="btn btn-secondary flex items-center gap-1.5">
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

      {/* 3-Stage Progress Visualization */}
      <StageProgress log={log} />

      {/* Details Card */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-800 mb-4"><Bi k="section.recordDetail" /></h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.batchId" /></p>
            <p className="font-medium">{log.batch_id}</p>
          </div>

          {/* Start data */}
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.startTemp" /></p>
            <p className="text-2xl font-bold text-gray-800">{log.start_temp}°C</p>
          </div>
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.startTime" /></p>
            <p className="font-medium">{formatDateTime(log.start_time)}</p>
          </div>

          {/* Stage 1 data */}
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.stage1Temp" /></p>
            <p className={`text-2xl font-bold ${
              log.stage1_temp
                ? parseFloat(log.stage1_temp) <= 21
                  ? 'text-green-600'
                  : 'text-red-600'
                : 'text-gray-300'
            }`}>
              {log.stage1_temp ? `${log.stage1_temp}°C` : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.stage1Time" /></p>
            <p className="font-medium">{formatDateTime(log.stage1_time)}</p>
          </div>
          {log.stage1_duration_minutes && (
            <div>
              <p className="text-xs text-gray-400"><Bi k="field.stage1Duration" /></p>
              <p className={`font-medium ${
                parseFloat(log.stage1_duration_minutes) <= 120 ? 'text-green-600' : 'text-red-600'
              }`}>
                {log.stage1_duration_minutes} {bi('label.minutes')}
              </p>
            </div>
          )}

          {/* End data */}
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.endTemp" /></p>
            <p className={`text-2xl font-bold ${
              log.end_temp
                ? parseFloat(log.end_temp) < 5
                  ? 'text-green-600'
                  : 'text-red-600'
                : 'text-gray-300'
            }`}>
              {log.end_temp ? `${log.end_temp}°C` : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.endTime" /></p>
            <p className="font-medium">{formatDateTime(log.end_time)}</p>
          </div>
          {log.total_duration_minutes && (
            <div>
              <p className="text-xs text-gray-400"><Bi k="field.totalDuration" /></p>
              <p className={`font-medium ${
                parseFloat(log.total_duration_minutes) <= 360 ? 'text-green-600' : 'text-red-600'
              }`}>
                {log.total_duration_minutes} {bi('label.minutes')}
              </p>
            </div>
          )}
        </div>

        {/* CCP Thresholds */}
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-xs text-blue-600 font-medium mb-2"><Bi label={{ zh: 'CCP 冷卻標準', en: 'CCP Cooling Standard' }} /></p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-blue-800">
            <div>
              <span className="font-medium"><Bi k="label.stage1Progress" />{': '}</span>
              <Bi label={{ zh: '120分鐘內降至 21°C 以下', en: '≤ 21°C within 120 min' }} />
            </div>
            {!log.goes_to_freezer && (
              <div>
                <span className="font-medium"><Bi label={{ zh: '總計', en: 'Total' }} />{': '}</span>
                <Bi label={{ zh: '360分鐘內降至 5°C 以下', en: '≤ 5°C within 360 min' }} />
              </div>
            )}
            {log.goes_to_freezer && (
              <div className="text-cyan-700">
                ❄️ <Bi k="label.freezerMode.hint" />
              </div>
            )}
          </div>
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
