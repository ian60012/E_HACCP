import { ReactNode } from 'react';

interface FormFieldProps {
  label: ReactNode;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}

export default function FormField({ label, required = false, error, hint, children }: FormFieldProps) {
  return (
    <div>
      <label className="label">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && (
        <p className="mt-1 text-xs text-gray-400">{hint}</p>
      )}
      {error && (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}
