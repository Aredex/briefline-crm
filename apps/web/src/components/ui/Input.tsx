/*
 * Input — always-visible label (never placeholder-only, AP-12), inline error
 * with role="alert", aria-invalid + aria-describedby wiring. Optional leading
 * icon (decorative, aria-hidden). Migrated to Tailwind CSS.
 */
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../../lib/utils'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helpText?: string
  hideLabel?: boolean
  inputClassName?: string
  leftIcon?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, helpText, hideLabel = false, className, inputClassName, required, id, leftIcon, ...rest },
  ref,
) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const errorId = `${inputId}-error`
  const helpId = `${inputId}-help`
  const describedBy = [error ? errorId : null, helpText && !error ? helpId : null]
    .filter(Boolean)
    .join(' ') || undefined

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={inputId} className={cn('text-sm font-medium text-[var(--color-gray-700)]', hideLabel && 'sr-only')}>
          {label}
          {required && (
            <span className="text-[var(--color-error-700)] ml-0.5" aria-hidden="true">*</span>
          )}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-gray-400)]" aria-hidden="true">
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full h-[44px] px-3 rounded-md border border-[var(--color-gray-200)] bg-white text-sm text-[var(--color-gray-900)]',
            'placeholder:text-[var(--color-gray-400)]',
            'focus:outline-none focus:border-[var(--color-primary-600)] focus:ring-1 focus:ring-[var(--color-primary-600)]',
            'transition-colors duration-[var(--duration-fast)]',
            leftIcon && 'pl-10',
            error && 'border-[var(--color-error-border)] focus:border-[var(--color-error-700)] focus:ring-[var(--color-error-700)]',
            inputClassName,
          )}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          required={required}
          {...rest}
        />
      </div>
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
