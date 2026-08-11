/*
 * Server-error → form mapping (AP-48). Problem Details field errors
 * (errors[].field) are applied to the matching form fields via setError;
 * anything unmapped returns false so the caller shows a banner instead.
 */
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form'
import { ApiError } from '../api/client'

/** Mutation-level error shown as a banner (unmapped to any field). */
export interface BannerError {
  title: string
  detail: string
}

/** Applies `errors[]` from a failed mutation to the form; returns true if any field was mapped. */
export function applyFieldErrors<T extends FieldValues>(
  form: UseFormReturn<T>,
  error: unknown,
): boolean {
  if (!(error instanceof ApiError) || !error.errors || error.errors.length === 0) return false
  let mapped = false
  for (const fieldError of error.errors) {
    const field = fieldError.field as Path<T>
    // Only map fields the form actually knows about (server DTOs may include others).
    if (field in form.getValues()) {
      form.setError(field, { type: 'server', message: fieldError.message })
      mapped = true
    }
  }
  return mapped
}

/** Human title for a mutation-level server error (non-field). */
export function serverErrorTitle(error: unknown): string {
  if (error instanceof ApiError) return error.title || 'Request failed'
  return 'Something went wrong'
}

/** Human detail for a mutation-level server error (non-field). */
export function serverErrorDetail(error: unknown): string {
  if (error instanceof ApiError) return error.detail || 'Please try again.'
  return 'We could not complete this action. Please try again.'
}
