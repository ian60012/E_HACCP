import { ReactNode } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface Props {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}

export default function Drawer({ open, title, subtitle, onClose, children, wide }: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex justify-end bg-slate-900/30"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`bg-white h-full overflow-y-auto shadow-2xl ${
          wide ? 'w-full max-w-[980px]' : 'w-full max-w-[560px]'
        }`}
      >
        <div className="flex items-start justify-between gap-4 p-5 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            {subtitle ? <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            className="text-slate-400 hover:text-slate-600"
            onClick={onClose}
            aria-label="關閉"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
