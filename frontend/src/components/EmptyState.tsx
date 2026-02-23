import { Link } from 'react-router-dom';
import { InboxIcon } from '@heroicons/react/24/outline';

interface EmptyStateProps {
  title?: string;
  message?: string;
  actionLabel?: string;
  actionTo?: string;
}

export default function EmptyState({
  title = '暫無資料',
  message = '目前還沒有任何記錄',
  actionLabel,
  actionTo,
}: EmptyStateProps) {
  return (
    <div className="text-center py-12">
      <InboxIcon className="h-12 w-12 text-gray-300 mx-auto" />
      <h3 className="mt-3 text-lg font-medium text-gray-600">{title}</h3>
      <p className="mt-1 text-sm text-gray-400">{message}</p>
      {actionLabel && actionTo && (
        <Link to={actionTo} className="btn btn-primary mt-4 inline-block">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
