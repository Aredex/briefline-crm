/*
 * Select — always-visible label, inline error with role="alert", aria-invalid
 * + aria-describedby wiring. Placeholder option is disabled by default.
 * Migrated to Tailwind CSS.
 */
import { forwardRef, useId, type SelectHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label: string
  options: SelectOption[]
  placeholder?: string
  error?: string
  helpText?: string
  hideLabel?: boolean
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, options, placeholder, error, helpText, hideLabel = false, className, required, id, ...rest },
  ref,
) {
  const generatedId = useId()
  const selectId = id ?? generatedId
  const errorId = `${selectId}-error`
  const helpId = `${selectId}-help`
  const describedBy = [error ? errorId : null, helpText && !error ? helpId : null]
    .filter(Boolean)
    .join(' ') || undefined

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={selectId} className={cn('text-sm font-medium text-[var(--color-gray-700)]', hideLabel && 'sr-only')}>
        {label}
        {required && (
          <span className="text-[var(--color-error-700)] ml-0.5" aria-hidden="true">*</span>
        )}
      </label>
      <select
        ref={ref}
        id={selectId}
        className={cn(
          'w-full h-[44px] px-3 rounded-md border border-[var(--color-gray-200)] bg-white text-sm text-[var(--color-gray-900)]',
          'focus:outline-none focus:border-[var(--color-primary-600)] focus:ring-1 focus:ring-[var(--color-primary-600)]',
          'transition-colors duration-[var(--duration-fast)]',
          error && 'border-[var(--color-error-border)]',
        )}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        required={required}
        {...rest}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <p id={errorId} className="text-xs text-[var(--color-error-700)]" role="alert">
          {error}
        </p>
      ) : helpText ? (
        <p id={helpId} className="text-xs text-[var(--color-gray-400)]">
          {helpText}
        </p>
      ) : null}
    </div>
  )
})
