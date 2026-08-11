// Global exception filter — API-004 (PH-04).
//
// Converts EVERY exception into an RFC 9457 Problem Details document:
//   - NestJS HttpExceptions: their `code` (when the response object carries
//     one) or a status-derived fallback; `detail` and `errors[]` pass through.
//   - 429: RATE_LIMITED with retryAfterSeconds + the Retry-After header.
//   - Anything else (unhandled errors): 500 INTERNAL_ERROR with a fixed safe
//     detail. Stack traces and SQL are logged server-side with the traceId —
//     never sent to the client.
import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { Request, Response } from 'express'
import type { FieldError, ProblemDetails } from '../dto/problem-detail.dto'
import { CustomLogger } from '../logger/custom.logger'

const TITLES: Record<string, string> = {
  INVALID_CREDENTIALS: 'Invalid credentials',
  TOKEN_INVALID: 'Invalid session token',
  TOKEN_EXPIRED: 'Session token expired',
  INACTIVE_USER: 'User is inactive',
  CSRF_INVALID: 'Invalid CSRF token',
  RATE_LIMITED: 'Too many requests',
  VALIDATION_ERROR: 'Validation failed',
  EMAIL_ALREADY_EXISTS: 'Email already exists',
  USER_NOT_FOUND: 'User not found',
  CLIENT_NOT_FOUND: 'Client not found',
  CLIENT_ARCHIVED: 'Client archived',
  CANNOT_ASSIGN_ARCHIVED_CLIENT: 'Archived client',
  LAST_ADMIN: 'Last active admin cannot be modified',
  CONCURRENT_MODIFICATION: 'Concurrent modification detected',
  // PH-06 task codes (openapi-and-errors.md §3.6).
  TASK_NOT_FOUND: 'Task not found',
  STALE_VERSION: 'Stale version',
  TASK_ARCHIVED: 'Task archived',
  ASSIGNEE_REQUIRED: 'Assignee required',
  BLOCKED_REASON_REQUIRED: 'Blocked reason required',
  INACTIVE_ASSIGNEE: 'Inactive assignee',
  UNKNOWN_PROPERTY: 'Unknown property',
  INVALID_FORMAT: 'Invalid format',
  INVALID_ENUM: 'Invalid enum value',
  INVALID_LENGTH: 'Invalid length',
  FORBIDDEN: 'Forbidden',
  NOT_FOUND: 'Not found',
  CONFLICT: 'Conflict',
  UNPROCESSABLE: 'Unprocessable entity',
  INTERNAL_ERROR: 'Internal server error',
}

const CODE_BY_STATUS: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'TOKEN_INVALID',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE',
  429: 'RATE_LIMITED',
}

const DEFAULT_DETAIL: Record<number, string> = {
  400: 'The request is malformed or contains invalid values.',
  401: 'Authentication is required.',
  403: 'You do not have permission to perform this action.',
  404: 'The requested resource was not found.',
  409: 'The request conflicts with the current state of the resource.',
  422: 'The request is well-formed but could not be processed.',
  429: 'Too many requests. Please wait and try again.',
}

function errorSlug(code: string): string {
  return code.toLowerCase().replaceAll('_', '-')
}

function titleFor(code: string, status: number): string {
  return TITLES[code] ?? DEFAULT_DETAIL[status] ?? 'Unexpected error'
}

// Codes that are logged at warn level — everything else on the 4xx range is
// business noise (validation, not-found) and stays out of the server logs.
const WARN_CODES = new Set([
  'INVALID_CREDENTIALS',
  'TOKEN_INVALID',
  'TOKEN_EXPIRED',
  'INACTIVE_USER',
  'CSRF_INVALID',
  'RATE_LIMITED',
  'LAST_ADMIN',
])

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  constructor(private readonly logger: CustomLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()
    const traceId = randomUUID()

    const problem = this.toProblemDetails(exception, request, traceId)

    if (problem.status >= 500) {
      const stack = exception instanceof Error ? (exception.stack ?? undefined) : undefined
      const message = exception instanceof Error ? exception.message : String(exception)
      this.logger.error(message, stack, 'ProblemDetailsFilter', { traceId, code: problem.code })
    } else if (WARN_CODES.has(problem.code)) {
      this.logger.warn(problem.detail, 'ProblemDetailsFilter', {
        traceId,
        code: problem.code,
        status: problem.status,
        method: request.method,
        path: request.originalUrl,
      })
    }

    response.setHeader('X-Trace-Id', traceId)
    if (problem.retryAfterSeconds !== undefined) {
      response.setHeader('Retry-After', String(problem.retryAfterSeconds))
    }
    // retryAfterSeconds is a documented body extension (error catalogue §RATE_LIMITED),
    // not just a header — the FE disables retries until it elapses (AUTH-FE-001).
    response.status(problem.status).json(problem)
  }

  private toProblemDetails(exception: unknown, request: Request, traceId: string): ProblemDetails {
    const instance = `${request.method} ${request.originalUrl}`
    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const raw = exception.getResponse()
      let code: string | undefined
      let detail: string | undefined
      let errors: FieldError[] | undefined
      if (typeof raw === 'string') {
        detail = raw
      } else if (raw !== null && typeof raw === 'object') {
        const body = raw as Record<string, unknown>
        if (typeof body.code === 'string') code = body.code
        if (typeof body.detail === 'string') detail = body.detail
        if (Array.isArray(body.errors)) errors = body.errors as FieldError[]
        if (typeof body.message === 'string' && detail === undefined) detail = body.message
      }
      if (status === 429) {
        code = 'RATE_LIMITED'
      } else if (code === undefined) {
        code = CODE_BY_STATUS[status] ?? 'INTERNAL_ERROR'
      }
      const retryAfterSeconds = status === 429 ? (request.path.includes('/auth/login') ? 300 : 60) : undefined
      // Documented body extensions (error catalogue §3.6): STALE_VERSION ships
      // the current server state so the client can re-sync and retry. Only
      // keys the contract declares are copied — arbitrary response fields are
      // never forwarded to the client.
      const extensions: { currentVersion?: number; currentState?: ProblemDetails['currentState'] } = {}
      if (raw !== null && typeof raw === 'object') {
        const body = raw as Record<string, unknown>
        if (typeof body.currentVersion === 'number') extensions.currentVersion = body.currentVersion
        if (body.currentState !== undefined) extensions.currentState = body.currentState as ProblemDetails['currentState']
      }
      return {
        type: `https://briefline-crm.demo/errors/${errorSlug(code)}`,
        title: titleFor(code, status),
        status,
        detail: detail && detail.length > 0 && detail !== status.toString() ? detail : DEFAULT_DETAIL[status] ?? 'Unexpected error',
        instance,
        traceId,
        code,
        ...(errors !== undefined ? { errors } : {}),
        ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
        ...extensions,
      }
    }
    // Non-HttpException: never leak internals to the client.
    return {
      type: 'https://briefline-crm.demo/errors/internal-error',
      title: 'Internal server error',
      status: 500,
      detail: 'An unexpected error occurred. Please try again later.',
      instance,
      traceId,
      code: 'INTERNAL_ERROR',
    }
  }
}
