type StatusType =
  | 'Pass' | 'Fail' | 'Deviation'
  | 'Accept' | 'Reject' | 'Hold'
  | 'Critical' | 'Major' | 'Minor'
  | 'Open' | 'Closed'
  | 'Locked' | 'Voided';

const statusConfig: Record<StatusType, { bg: string; text: string; label: string }> = {
  Pass:      { bg: 'bg-green-100', text: 'text-green-700', label: '通過 Pass' },
  Fail:      { bg: 'bg-red-100',   text: 'text-red-700',   label: '失敗 Fail' },
  Deviation: { bg: 'bg-orange-100', text: 'text-orange-700', label: '偏差 Deviation' },
  Accept:    { bg: 'bg-green-100', text: 'text-green-700', label: '接受 Accept' },
  Reject:    { bg: 'bg-red-100',   text: 'text-red-700',   label: '拒絕 Reject' },
  Hold:      { bg: 'bg-yellow-100', text: 'text-yellow-700', label: '保留 Hold' },
  Critical:  { bg: 'bg-red-100',   text: 'text-red-700',   label: '嚴重 Critical' },
  Major:     { bg: 'bg-orange-100', text: 'text-orange-700', label: '主要 Major' },
  Minor:     { bg: 'bg-yellow-100', text: 'text-yellow-700', label: '次要 Minor' },
  Open:      { bg: 'bg-blue-100',  text: 'text-blue-700',  label: '未結案 Open' },
  Closed:    { bg: 'bg-gray-100',  text: 'text-gray-700',  label: '已結案 Closed' },
  Locked:    { bg: 'bg-indigo-100', text: 'text-indigo-700', label: '已鎖定 Locked' },
  Voided:    { bg: 'bg-gray-200',  text: 'text-gray-600',  label: '已作廢 Voided' },
};

interface StatusBadgeProps {
  status: string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
}

export default function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  if (!status) return null;

  const config = statusConfig[status as StatusType];
  if (!config) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
        {status}
      </span>
    );
  }

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
    lg: 'px-3 py-1.5 text-base',
  };

  return (
    <span className={`inline-flex items-center rounded-full font-medium ${config.bg} ${config.text} ${sizeClasses[size]}`}>
      {config.label}
    </span>
  );
}
