import { LockClosedIcon, NoSymbolIcon, UserIcon, ClockIcon } from '@heroicons/react/24/outline';
import StatusBadge from './StatusBadge';
import RoleGate from './RoleGate';
import Bi from '@/components/Bi';

interface ALCOAAuditBarProps {
  operatorName: string | null;
  verifierName: string | null;
  createdAt: string;
  isLocked: boolean;
  isVoided: boolean;
  voidReason: string | null;
  voidedAt: string | null;
  voidedBy: number | null;
  onLock?: () => void;
  onVoid?: () => void;
  lockLoading?: boolean;
}

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

export default function ALCOAAuditBar({
  operatorName,
  verifierName,
  createdAt,
  isLocked,
  isVoided,
  voidReason,
  voidedAt,
  onLock,
  onVoid,
  lockLoading,
}: ALCOAAuditBarProps) {
  return (
    <div className="space-y-3">
      {/* Voided banner */}
      {isVoided && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="flex items-center gap-2 text-red-700 font-medium">
            <NoSymbolIcon className="h-5 w-5" />
            <Bi k="audit.voidedBanner" />
          </div>
          {voidReason && (
            <p className="mt-1 text-sm text-red-600"><Bi k="audit.voidReason" />：{voidReason}</p>
          )}
          {voidedAt && (
            <p className="mt-1 text-xs text-red-400"><Bi k="audit.voidedAt" />：{formatDateTime(voidedAt)}</p>
          )}
        </div>
      )}

      {/* Audit info strip */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <UserIcon className="h-4 w-4 text-gray-400" />
            <div>
              <p className="text-gray-400 text-xs"><Bi k="audit.operator" /></p>
              <p className="font-medium text-gray-700">{operatorName || '—'}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ClockIcon className="h-4 w-4 text-gray-400" />
            <div>
              <p className="text-gray-400 text-xs"><Bi k="audit.recordTime" /></p>
              <p className="font-medium text-gray-700">{formatDateTime(createdAt)}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <LockClosedIcon className="h-4 w-4 text-gray-400" />
            <div>
              <p className="text-gray-400 text-xs"><Bi k="audit.verifier" /></p>
              <p className="font-medium text-gray-700">{verifierName || <Bi k="audit.notVerified" />}</p>
            </div>
          </div>

          <div>
            <p className="text-gray-400 text-xs"><Bi k="audit.status" /></p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {isVoided ? (
                <StatusBadge status="Voided" />
              ) : isLocked ? (
                <StatusBadge status="Locked" />
              ) : (
                <span className="text-xs text-gray-500">編輯中</span>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        {!isVoided && (
          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-200">
            {!isLocked && onLock && (
              <RoleGate roles={['QA', 'Manager']}>
                <button
                  onClick={onLock}
                  disabled={lockLoading}
                  className="btn bg-indigo-600 text-white hover:bg-indigo-700 text-sm flex items-center gap-1.5"
                >
                  <LockClosedIcon className="h-4 w-4" />
                  {lockLoading ? '鎖定中...' : <Bi k="btn.lock" />}
                </button>
              </RoleGate>
            )}
            {onVoid && (
              <RoleGate roles={['Manager']}>
                <button
                  onClick={onVoid}
                  className="btn btn-danger text-sm flex items-center gap-1.5"
                >
                  <NoSymbolIcon className="h-4 w-4" />
                  <Bi k="btn.void" />
                </button>
              </RoleGate>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
