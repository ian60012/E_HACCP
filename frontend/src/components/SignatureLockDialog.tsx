import { useState } from 'react';
import { LockClosedIcon } from '@heroicons/react/24/outline';
import SignaturePad from './SignaturePad';

interface SignatureLockDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  loading?: boolean;
  onConfirm: (signatureDataUrl: string) => void;
  onCancel: () => void;
}

export default function SignatureLockDialog({
  open,
  title,
  message,
  confirmLabel = '驗核鎖定 Verify & Lock',
  loading = false,
  onConfirm,
  onCancel,
}: SignatureLockDialogProps) {
  const [signature, setSignature] = useState('');

  if (!open) return null;

  const close = () => {
    if (!loading) {
      setSignature('');
      onCancel();
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50" onClick={close} />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 rounded-full bg-indigo-100 p-2 text-indigo-600">
              <LockClosedIcon className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
              <p className="mt-1 text-sm text-gray-500">{message}</p>
            </div>
          </div>

          <div className="mt-5">
            <SignaturePad
              value={signature}
              onChange={setSignature}
              label="QA 手寫簽名 QA Signature"
              required
              disabled={loading}
            />
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button onClick={close} disabled={loading} className="btn btn-secondary">
              取消 Cancel
            </button>
            <button
              onClick={() => onConfirm(signature)}
              disabled={loading || !signature}
              className="btn bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? '處理中...' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

