/*
 * Textarea — same contract as Input (visible label, inline error with
 * role="alert", aria-invalid + aria-describedby) for multiline content
 * (client notes, task descriptions).
 */
import { forwardRef, useId, type TextareaHTMLAttributes } from 'react'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Visible label. Optional when wrapped by FormField (which provides its
   *  own label), required for standalone usage (AP-12). */
  label?: string
  error?: string
  helpText?: string
  /** Hide the label visually while keeping it in the a11y tree. */
  hideLabel?: boolean
  rows?: number
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, helpText, hideLabel = false, className, rows = 4, required, id, ...rest },
  ref,
) {
  const generatedId = useId()
  const textareaId = id ?? generatedId
  const errorId = `${textareaId}-error`
  const helpId = `${textareaId}-help`
  const describedBy = [error ? errorId : null, helpText && !error ? helpId : null]
    .filter(Boolean)
    .join(' ') || undefined

  return (
    <div className={`field ${className ?? ''}`}>
      {label && (
        <label htmlFor={textareaId} className={hideLabel ? 'sr-only' : 'field__label'}>
          {label}
          {required && (
            <span className="field__required" aria-hidden="true">
              {' '}
              *
            </span>
          )}
        </label>
      )}
      <textarea
        ref={ref}
        id={textareaId}
        rows={rows}
        className={`input input--textarea ${error ? 'input--error' : ''}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        required={required}
        {...rest}
      />
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
