import { useState } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  /** If true, shows a textarea for reason input */
  requireReason?: boolean;
  reasonLabel?: string;
  reasonMinLength?: number;
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
  loading?: boolean;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '確認',
  cancelLabel = '取消',
  variant = 'danger',
  requireReason = false,
  reasonLabel = '原因',
  reasonMinLength = 5,
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState('');

  if (!open) return null;

  const variantColors = {
    danger: 'bg-red-100 text-red-600',
    warning: 'bg-yellow-100 text-yellow-600',
    info: 'bg-blue-100 text-blue-600',
  };

  const buttonColors = {
    danger: 'btn-danger',
    warning: 'bg-yellow-600 text-white hover:bg-yellow-700',
    info: 'btn-primary',
  };

  const canConfirm = !requireReason || reason.trim().length >= reasonMinLength;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/50" onClick={onCancel} />

      {/* Dialog */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
          <div className="flex items-start gap-4">
            <div className={`flex-shrink-0 p-2 rounded-full ${variantColors[variant]}`}>
              <ExclamationTriangleIcon className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
              <p className="mt-1 text-sm text-gray-500">{message}</p>

              {requireReason && (
                <div className="mt-4">
                  <label className="label">{reasonLabel} *</label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="input min-h-[80px]"
                    placeholder={`請輸入${reasonLabel}（至少 ${reasonMinLength} 字）`}
                  />
                  {reason.length > 0 && reason.trim().length < reasonMinLength && (
                    <p className="mt-1 text-xs text-red-500">
                      至少需要 {reasonMinLength} 個字
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={onCancel}
              disabled={loading}
              className="btn btn-secondary"
            >
              {cancelLabel}
            </button>
            <button
              onClick={() => onConfirm(requireReason ? reason.trim() : undefined)}
              disabled={loading || !canConfirm}
              className={`btn ${buttonColors[variant]} disabled:opacity-50`}
            >
              {loading ? '處理中...' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
