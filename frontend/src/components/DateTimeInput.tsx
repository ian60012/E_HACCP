import { useRef } from 'react';

interface Props {
  value: string;          // "YYYY-MM-DDTHH:MM"
  onChange: (value: string) => void;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  min?: string;           // "YYYY-MM-DDTHH:MM" – only date portion applied to date input
  copyDateFrom?: string;  // reference datetime — shows "同天" button to copy its date portion
}

/** Auto-insert ":" after 2 digits when typing time */
function formatTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

/**
 * Date + text-time pair that always shows 24-hour format.
 * browser <input type="time"> follows OS locale (12 h on Windows by default),
 * so we use a plain text field for the time part instead.
 */
export default function DateTimeInput({
  value,
  onChange,
  className = 'input',
  required,
  disabled,
  min,
  copyDateFrom,
}: Props) {
  const [datePart = '', timePart = ''] = value ? value.split('T') : [];
  const minDate = min ? min.split('T')[0] : undefined;
  const timeRef = useRef<HTMLInputElement>(null);
  const refDate = copyDateFrom ? copyDateFrom.split('T')[0] : '';

  const handleDate = (d: string) => onChange(d ? `${d}T${timePart || '00:00'}` : '');

  const handleTimeChange = (raw: string) => {
    const formatted = formatTimeInput(raw);
    if (datePart) onChange(`${datePart}T${formatted}`);
    // keep cursor after auto-inserted ":"
    if (timeRef.current && formatted.length === 3 && raw.length === 2) {
      setTimeout(() => timeRef.current?.setSelectionRange(3, 3), 0);
    }
  };

  const handleCopyDate = () => {
    if (refDate) onChange(`${refDate}T${timePart || '00:00'}`);
  };

  return (
    <div className="flex gap-2 items-center">
      <input
        type="date"
        value={datePart}
        onChange={(e) => handleDate(e.target.value)}
        className={className}
        required={required}
        disabled={disabled}
        min={minDate}
      />
      {copyDateFrom !== undefined && refDate && !disabled && (
        <button
          type="button"
          onClick={handleCopyDate}
          className="px-2 py-1 text-xs font-medium rounded bg-blue-50 text-blue-600 hover:bg-blue-100 whitespace-nowrap"
          title="Copy date from start time"
        >
          同天
        </button>
      )}
      <input
        ref={timeRef}
        type="text"
        value={timePart}
        onChange={(e) => handleTimeChange(e.target.value)}
        className={`${className} w-24`}
        required={required}
        disabled={disabled}
        placeholder="HH:MM"
        pattern="[0-2][0-9]:[0-5][0-9]"
        maxLength={5}
        inputMode="numeric"
      />
    </div>
  );
}
