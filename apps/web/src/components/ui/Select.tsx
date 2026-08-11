/*
 * Select — always-visible label, inline error with role="alert", aria-invalid
 * + aria-describedby wiring. Placeholder option is disabled by default.
 */
import { forwardRef, useId, type SelectHTMLAttributes } from 'react'

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
    <div className={`field ${className ?? ''}`}>
      <label htmlFor={selectId} className={hideLabel ? 'sr-only' : 'field__label'}>
        {label}
        {required && (
          <span className="field__required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      <select
        ref={ref}
        id={selectId}
        className={`input ${error ? 'input--error' : ''}`}
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
        <p id={errorId} className="field__error" role="alert">
          {error}
        </p>
      ) : helpText ? (
        <p id={helpId} className="field__help">
          {helpText}
        </p>
      ) : null}
    </div>
  )
})
