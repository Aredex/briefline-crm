/*
 * FormField — single RHF field: visible label, error with role="alert",
 * aria-invalid + aria-describedby. Children is a render prop receiving the
 * registered input props, so the actual control (Input/Select) stays dumb.
 */
import { useId, type ReactElement } from 'react'
import type { ChangeHandler, FieldValues, Path, UseFormReturn } from 'react-hook-form'

export interface RegisteredFieldProps<T extends FieldValues> {
  id: string
  'aria-invalid': boolean | undefined
  'aria-describedby': string | undefined
  required: boolean
  name: Path<T>
  onBlur: ChangeHandler
  onChange: ChangeHandler
  ref: (
    element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null,
  ) => void
}

export interface FormFieldProps<T extends FieldValues> {
  form: UseFormReturn<T>
  name: Path<T>
  label: string
  helpText?: string
  required?: boolean
  children: (field: RegisteredFieldProps<T>) => ReactElement
}

export function FormField<T extends FieldValues>({
  form,
  name,
  label,
  helpText,
  required = false,
  children,
}: FormFieldProps<T>) {
  const generatedId = useId()
  const fieldId = `field-${name}-${generatedId}`
  const { register, formState } = form
  const error = formState.errors[name]
  const errorMessage = error ? String(error.message ?? 'This field is invalid.') : undefined
  const errorId = `${fieldId}-error`
  const helpId = `${fieldId}-help`
  const describedBy = [error ? errorId : null, helpText && !error ? helpId : null]
    .filter(Boolean)
    .join(' ') || undefined

  const registered = register(name, { required: required ? 'This field is required.' : undefined })

  return (
    <div className="field">
      <label htmlFor={fieldId} className="field__label">
        {label}
        {required && (
          <span className="field__required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {children({
        ...registered,
        id: fieldId,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
        required,
      })}
      {error ? (
        <p id={errorId} className="field__error" role="alert">
          {errorMessage}
        </p>
      ) : helpText ? (
        <p id={helpId} className="field__help">
          {helpText}
        </p>
      ) : null}
    </div>
  )
}
