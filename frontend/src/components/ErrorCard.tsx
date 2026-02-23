import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface ErrorCardProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export default function ErrorCard({ title = '發生錯誤', message, onRetry }: ErrorCardProps) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
      <ExclamationTriangleIcon className="h-10 w-10 text-red-400 mx-auto" />
      <h3 className="mt-3 text-lg font-medium text-red-800">{title}</h3>
      <p className="mt-1 text-sm text-red-600">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn btn-secondary mt-4">
          重試
        </button>
      )}
    </div>
  );
}
