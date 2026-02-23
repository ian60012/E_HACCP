import { t, type BiLabelType } from '@/i18n/labels';

interface BiProps {
  /** Label key to look up from the dictionary */
  k?: string;
  /** Direct label object (overrides k) */
  label?: BiLabelType;
  /** Whether to show English text (default: true) */
  showEn?: boolean;
  /** Additional CSS class */
  className?: string;
}

/**
 * Bilingual label component.
 * Shows Chinese primary text with smaller English text inline.
 *
 * Usage:
 *   <Bi k="field.supplier" />       → 供應商 Supplier
 *   <Bi label={{ zh: '自訂', en: 'Custom' }} />
 */
export default function Bi({ k, label, showEn = true, className }: BiProps) {
  const resolved = label || (k ? t(k) : { zh: '', en: '' });
  return (
    <span className={className}>
      {resolved.zh}
      {showEn && resolved.en && (
        <span className="text-gray-400 text-xs ml-1 font-normal">{resolved.en}</span>
      )}
    </span>
  );
}

/**
 * Bilingual text helper for non-JSX contexts (e.g., placeholders, titles).
 * Returns: "中文 English"
 */
export function bi(key: string): string {
  const l = t(key);
  return `${l.zh} ${l.en}`;
}
