/*
 * Input — always-visible label (never placeholder-only, AP-12), inline error
 * with role="alert", aria-invalid + aria-describedby wiring. Optional leading
 * icon (decorative, aria-hidden).
 */
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Visible label. Optional when the field is wrapped by FormField (which
   *  provides its own label), required for standalone usage (AP-12). */
  label?: string
  error?: string
  helpText?: string
  /** Hide the label visually while keeping it in the a11y tree. */
  hideLabel?: boolean
  inputClassName?: string
  /** Decorative leading icon (search, lock…). */
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
    <div className={`field ${className ?? ''}`}>
      {label && (
        <label htmlFor={inputId} className={hideLabel ? 'sr-only' : 'field__label'}>
          {label}
          {required && (
            <span className="field__required" aria-hidden="true">
              {' '}
              *
            </span>
          )}
        </label>
      )}
      <div className={`input__wrap${leftIcon ? ' input__wrap--icon' : ''}`}>
        {leftIcon && (
          <span className="input__icon" aria-hidden="true">
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`input ${error ? 'input--error' : ''} ${inputClassName ?? ''}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          required={required}
          {...rest}
        />
      </div>
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
