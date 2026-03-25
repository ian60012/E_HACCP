import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeftIcon, PencilSquareIcon } from '@heroicons/react/24/outline';
import { ppeComplianceLogsApi } from '@/api/ppe-compliance-logs';
import { PPEComplianceLog, PassFail } from '@/types/ppe-compliance-log';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import StatusBadge from '@/components/StatusBadge';
import ALCOAAuditBar from '@/components/ALCOAAuditBar';
import ConfirmDialog from '@/components/ConfirmDialog';
import Bi, { bi } from '@/components/Bi';

const PPE_ITEMS: { key: string; zhLabel: string; enLabel: string }[] = [
  { key: 'hair_net', zhLabel: '髮網', enLabel: 'Hair Net' },
  { key: 'beard_net', zhLabel: '鬍鬚網', enLabel: 'Beard Net' },
  { key: 'clean_uniform', zhLabel: '乾淨制服', enLabel: 'Clean Uniform' },
  { key: 'no_nail_polish', zhLabel: '無指甲油', enLabel: 'No Nail Polish' },
  { key: 'safety_shoes', zhLabel: '安全鞋', enLabel: 'Safety Shoes' },
  { key: 'single_use_mask', zhLabel: '一次性口罩', enLabel: 'Single-use Mask' },
  { key: 'no_jewellery', zhLabel: '無飾品', enLabel: 'No Jewellery' },
  { key: 'hand_hygiene', zhLabel: '手部衛生', enLabel: 'Hand Hygiene' },
  { key: 'gloves', zhLabel: '手套', enLabel: 'Gloves' },
];

function formatDateTime(iso: string): string {
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

export default function PPEComplianceLogDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [log, setLog] = useState<PPEComplianceLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lockLoading, setLockLoading] = useState(false);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [voidLoading, setVoidLoading] = useState(false);

  const fetchLog = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const data = await ppeComplianceLogsApi.get(Number(id));
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
    setLockLoading(true);
    try {
      const updated = await ppeComplianceLogsApi.lock(log.id);
      setLog(updated);
    } catch {
      setError(bi('error.updateFailed'));
    } finally {
      setLockLoading(false);
    }
  };

  const handleVoid = async (reason?: string) => {
    if (!log || !reason) return;
    setVoidLoading(true);
    try {
      const updated = await ppeComplianceLogsApi.void(log.id, { void_reason: reason });
      setLog(updated);
      setVoidDialogOpen(false);
    } catch {
      setError(bi('error.updateFailed'));
    } finally {
      setVoidLoading(false);
    }
  };

  if (loading) return <LoadingSpinner fullPage />;
  if (error && !log) return <ErrorCard message={error} onRetry={fetchLog} />;
  if (!log) return <ErrorCard message={bi('error.loadFailed')} />;

  const failCount = PPE_ITEMS.filter(item => log[item.key as keyof PPEComplianceLog] === 'Fail').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/ppe-compliance-logs')}
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800"><Bi k="page.ppe.detail" /></h1>
            <p className="text-sm text-gray-500 mt-0.5"><Bi k="misc.record" /> #{log.id}</p>
          </div>
        </div>
        {!log.is_locked && !log.is_voided && (
          <Link
            to={`/ppe-compliance-logs/${log.id}/edit`}
            className="btn btn-secondary flex items-center gap-1.5"
          >
            <PencilSquareIcon className="h-4 w-4" />
            <Bi k="btn.edit" />
          </Link>
        )}
      </div>

      {/* Error banner */}
      {error && <ErrorCard message={error} />}

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
        onLock={handleLock}
        onVoid={() => setVoidDialogOpen(true)}
        lockLoading={lockLoading}
      />

      {/* Check Info */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-800 mb-4"><Bi k="section.checkInfo" /></h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.checkDate" /></p>
            <p className="font-medium text-gray-800">{log.check_date}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.checkArea" /></p>
            <p className="font-medium text-gray-800">{log.area_name || `#${log.area_id}`}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400"><Bi k="field.staffCount" /></p>
            <p className="font-medium text-gray-800">{log.staff_count}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">QA</p>
            <p className="font-medium text-gray-800">{log.operator_name}</p>
          </div>
        </div>
      </div>

      {/* PPE Items */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800"><Bi k="section.ppeItems" /></h2>
          <div className="flex items-center gap-2">
            {failCount === 0 ? (
              <span className="text-sm font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded">All Pass</span>
            ) : (
              <span className="text-sm font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded">{failCount} Fail</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {PPE_ITEMS.map((item) => {
            const val = log[item.key as keyof PPEComplianceLog] as PassFail;
            const isFail = val === 'Fail';
            return (
              <div
                key={item.key}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  isFail
                    ? 'border-red-200 bg-red-50'
                    : 'border-green-200 bg-green-50'
                }`}
              >
                <span className="text-sm font-medium text-gray-800">
                  {item.zhLabel}
                  <span className="text-gray-400 text-xs ml-1">{item.enLabel}</span>
                </span>
                <span className={`text-sm font-semibold ${isFail ? 'text-red-600' : 'text-green-600'}`}>
                  {val}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions & CAPA */}
      {(log.details_actions || log.capa_no) && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-800 mb-4"><Bi k="section.actionsCAPA" /></h2>
          {log.details_actions && (
            <div className="mb-3">
              <p className="text-xs text-gray-400"><Bi k="field.detailsActions" /></p>
              <p className="text-gray-700 whitespace-pre-wrap mt-1">{log.details_actions}</p>
            </div>
          )}
          {log.capa_no && (
            <div>
              <p className="text-xs text-gray-400"><Bi k="field.capaNo" /></p>
              <p className="font-medium text-gray-800 mt-1">{log.capa_no}</p>
            </div>
          )}
        </div>
      )}

      {/* Review Info */}
      {log.reviewer_name && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-800 mb-4"><Bi k="section.review" /></h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-400"><Bi k="field.reviewedBy" /></p>
              <p className="font-medium text-gray-800">{log.reviewer_name}</p>
            </div>
            {log.reviewed_at && (
              <div>
                <p className="text-xs text-gray-400"><Bi k="field.reviewedAt" /></p>
                <p className="font-medium text-gray-800">{log.reviewed_at}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Timestamps */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-800 mb-4"><Bi k="section.timestamps" /></h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-400"><Bi k="audit.createdAt" /></p>
            <p className="font-medium text-gray-700">{formatDateTime(log.created_at)}</p>
          </div>
        </div>
      </div>

      {/* Void Dialog */}
      <ConfirmDialog
        open={voidDialogOpen}
        title={bi('confirm.void.title')}
        message={bi('confirm.void.message')}
        confirmLabel={bi('confirm.void.confirm')}
        variant="danger"
        requireReason
        reasonLabel={bi('confirm.void.reason')}
        reasonMinLength={5}
        onConfirm={handleVoid}
        onCancel={() => setVoidDialogOpen(false)}
        loading={voidLoading}
      />
    </div>
  );
}
