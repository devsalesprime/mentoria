import React from 'react';

export interface FormFieldProps {
  label: string;
  error?: string;
  required?: boolean;
  className?: string;
  labelClassName?: string;
  children: React.ReactNode;
  hint?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  error,
  required = false,
  className,
  labelClassName,
  children,
  hint,
}) => {
  return (
    <div className={className}>
      <label className={`block text-sm font-semibold text-white/70 mb-1.5 ${labelClassName || ''}`}>
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && (
        <p className="mt-1 text-xs text-white/30">{hint}</p>
      )}
      {error && (
        <p className="mt-1 text-xs text-red-400">{error}</p>
      )}
    </div>
  );
};
