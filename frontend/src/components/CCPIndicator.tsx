import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid';

interface CCPIndicatorProps {
  value: number | string | null | undefined;
  limit: number | string;
  unit?: string;
  /** 'gte' = pass when value >= limit (cooking), 'lte' = pass when value <= limit (cooling temp) */
  mode?: 'gte' | 'lte';
  label?: string;
}

export default function CCPIndicator({
  value,
  limit,
  unit = '°C',
  mode = 'gte',
  label = 'CCP',
}: CCPIndicatorProps) {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  const numLimit = typeof limit === 'string' ? parseFloat(limit) : limit;

  if (numValue == null || isNaN(numValue)) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <span>{label}: 待輸入溫度</span>
      </div>
    );
  }

  const pass = mode === 'gte' ? numValue >= numLimit : numValue <= numLimit;

  return (
    <div className={`flex items-center gap-2 p-3 rounded-lg border ${
      pass
        ? 'bg-green-50 border-green-200'
        : 'bg-red-50 border-red-200'
    }`}>
      {pass ? (
        <CheckCircleIcon className="h-6 w-6 text-green-500 flex-shrink-0" />
      ) : (
        <XCircleIcon className="h-6 w-6 text-red-500 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium ${pass ? 'text-green-700' : 'text-red-700'}`}>
          {label}: {pass ? '通過' : '失敗'}
        </div>
        <div className="text-xs text-gray-500">
          實際: {numValue}{unit} | 標準: {mode === 'gte' ? '≥' : '≤'} {numLimit}{unit}
        </div>
      </div>
    </div>
  );
}
