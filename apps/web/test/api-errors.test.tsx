/*
 * Unit tests for server-error → form mapping (src/lib/api-errors.ts, AP-48).
 *
 * applyFieldErrors is exercised against a real react-hook-form instance (via
 * renderHook) so the getValues/setError interaction is the actual one, not a
 * hand-rolled fake. ApiError instances are built with the real constructor.
 */
import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useForm, type Path } from 'react-hook-form'
import { ApiError } from '../src/api/client'
import { applyFieldErrors, serverErrorDetail, serverErrorTitle } from '../src/lib/api-errors'

interface TestForm {
  title: string
  status: string
}

function formError() {
  const { result } = renderHook(() =>
    useForm<TestForm>({ defaultValues: { title: '', status: '' } }),
  )
  return result.current
}

function validationError(errors: ApiErrorOptionsLike['errors']) {
  return new ApiError({
    status: 422,
    title: 'Validation failed',
    detail: 'One or more fields are invalid.',
    code: 'VALIDATION_ERROR',
    errors,
  })
}

/** Structural stand-in so call sites read clearly. */
interface ApiErrorOptionsLike {
  errors?: { field: string; message: string }[]
}

describe('applyFieldErrors', () => {
  it('returns false and maps nothing for a non-ApiError', () => {
    const form = formError()
    let mapped: boolean
    act(() => {
      mapped = applyFieldErrors(form, new Error('boom'))
    })
    expect(mapped!).toBe(false)
    expect(form.getFieldState('title').error).toBeUndefined()
    expect(form.getFieldState('status').error).toBeUndefined()
  })

  it('returns false for an ApiError without field errors', () => {
    const form = formError()
    let mapped: boolean
    act(() => {
      mapped = applyFieldErrors(form, validationError(undefined))
    })
    expect(mapped!).toBe(false)
    expect(form.getFieldState('title').error).toBeUndefined()
  })

  it('returns false for an ApiError with an empty errors array', () => {
    const form = formError()
    let mapped: boolean
    act(() => {
      mapped = applyFieldErrors(form, validationError([]))
    })
    expect(mapped!).toBe(false)
  })

  it('maps a known field to a server error with the server message', () => {
    const form = formError()
    let mapped: boolean
    act(() => {
      mapped = applyFieldErrors(form, validationError([{ field: 'title', message: 'Title is required' }]))
    })
    expect(mapped!).toBe(true)
    // getFieldState reads the form store directly — formState.errors snapshots
    // only materialize on a re-render, which is not guaranteed here.
    expect(form.getFieldState('title').error).toMatchObject({
      type: 'server',
      message: 'Title is required',
    })
  })

  it('maps multiple known fields, ignoring unknown ones', () => {
    const form = formError()
    act(() => {
      applyFieldErrors(
        form,
        validationError([
          { field: 'title', message: 'Too short' },
          { field: 'serverOnlyField', message: 'Not in the form' },
          { field: 'status', message: 'Invalid status' },
        ]),
      )
    })
    expect(form.getFieldState('title').error?.message).toBe('Too short')
    expect(form.getFieldState('status').error?.message).toBe('Invalid status')
    // The unknown field never reaches setError — server DTOs may include more fields.
    expect(form.getFieldState('serverOnlyField' as unknown as Path<TestForm>).error).toBeUndefined()
  })

  it('returns false when none of the error fields are known to the form', () => {
    const form = formError()
    let mapped: boolean
    act(() => {
      mapped = applyFieldErrors(form, validationError([{ field: 'serverOnlyField', message: 'x' }]))
    })
    expect(mapped!).toBe(false)
    expect(form.getFieldState('title').error).toBeUndefined()
    expect(form.getFieldState('status').error).toBeUndefined()
  })
})

describe('serverErrorTitle', () => {
  it('returns the ApiError title when present', () => {
    const error = new ApiError({
      status: 409,
      title: 'Stale version',
      detail: 'The task changed elsewhere.',
      code: 'STALE_VERSION',
    })
    expect(serverErrorTitle(error)).toBe('Stale version')
  })

  it('falls back to "Request failed" for an ApiError without a title', () => {
    const error = new ApiError({ status: 500, title: '', detail: 'x', code: 'INTERNAL_ERROR' })
    expect(serverErrorTitle(error)).toBe('Request failed')
  })

  it('returns "Something went wrong" for non-ApiError errors', () => {
    expect(serverErrorTitle(new Error('boom'))).toBe('Something went wrong')
    expect(serverErrorTitle('weird')).toBe('Something went wrong')
  })
})

describe('serverErrorDetail', () => {
  it('returns the ApiError detail when present', () => {
    const error = new ApiError({
      status: 403,
      title: 'Forbidden',
      detail: 'Only the assignee can edit this task.',
      code: 'FORBIDDEN',
    })
    expect(serverErrorDetail(error)).toBe('Only the assignee can edit this task.')
  })

  it('falls back to "Please try again." for an ApiError without detail', () => {
    const error = new ApiError({ status: 500, title: 'x', detail: '', code: 'INTERNAL_ERROR' })
    expect(serverErrorDetail(error)).toBe('Please try again.')
  })

  it('returns the generic message for non-ApiError errors', () => {
    expect(serverErrorDetail(new Error('boom'))).toBe(
      'We could not complete this action. Please try again.',
    )
  })
})
