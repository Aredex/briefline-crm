/*
 * Form — <form> wrapper over a react-hook-form instance. On validation
 * failure it focuses the first field with an error (AP-48); server errors
 * arrive via onSubmit throwing, so callers use try/catch + setError.
 */
import { type FormEvent, type ReactNode } from 'react'
import type { FieldValues, UseFormReturn } from 'react-hook-form'

export interface FormProps<T extends FieldValues> {
  form: UseFormReturn<T>
  onSubmit: (values: T) => Promise<void> | void
  children: ReactNode
  className?: string
  'aria-label'?: string
  noValidate?: boolean
  /** Form id — lets a submit button live outside the <form> (dialog footers). */
  id?: string
}

export function Form<T extends FieldValues>({
  form,
  onSubmit,
  children,
  className,
  ...rest
}: FormProps<T>) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void form.handleSubmit(
      async (values) => onSubmit(values),
      (errors) => {
        // Focus the first invalid field so the user knows where to start.
        const firstError = Object.keys(errors)[0]
        if (firstError) form.setFocus(firstError as never, { shouldSelect: false })
      },
    )(event)
  }

  return (
    <form className={className} onSubmit={handleSubmit} noValidate {...rest}>
      {children}
    </form>
  )
}
