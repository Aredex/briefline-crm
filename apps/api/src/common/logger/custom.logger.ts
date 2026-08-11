// Structured JSON logger — API-005 (PH-04).
//
// Extends the NestJS ConsoleLogger so every line is a JSON object on stdout
// (parseable by Loki/Alloy in the observability stack). Sensitive material is
// redacted before it ever reaches the output: password-like keys, full JWTs,
// cookies, authorization headers and connection strings with credentials.
// Auth events (login success/failure, logout) are logged by AuthService
// through this logger WITHOUT request bodies or credentials.
import { ConsoleLogger, Injectable, type LogLevel } from '@nestjs/common'

const SENSITIVE_KEYS = new Set([
  'password',
  'pass',
  'passwd',
  'token',
  'secret',
  'authorization',
  'cookie',
  'set-cookie',
  'x-csrf-token',
  'csrf',
  'jwt',
  'apikey',
  'api_key',
])

const JWT_PATTERN = /^eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/
const PG_URL_CREDENTIALS = /(postgres(?:ql)?:\/\/)[^@\s]+@/

function redact(value: unknown): unknown {
  if (typeof value === 'string') {
    if (JWT_PATTERN.test(value)) {
      return '[REDACTED]'
    }
    if (PG_URL_CREDENTIALS.test(value)) {
      return value.replace(PG_URL_CREDENTIALS, '$1[REDACTED]@')
    }
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(item))
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : redact(item)
    }
    return out
  }
  return value
}

@Injectable()
export class CustomLogger extends ConsoleLogger {
  private write(level: LogLevel, message: unknown, optionalParams: unknown[]): void {
    const rest = [...optionalParams]
    let context: string | undefined
    // NestJS convention: the last string argument is the context.
    const last = rest[rest.length - 1]
    if (typeof last === 'string' && !(typeof message === 'string' && message === last)) {
      context = rest.pop() as string
    }
    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      context: context ?? this.context ?? undefined,
      message,
    }
    for (const param of rest) {
      if (param === undefined || param === null) continue
      if (typeof param === 'string') {
        entry.stack = param
      } else if (typeof param === 'object') {
        Object.assign(entry, param)
      } else {
        entry.extra = param
      }
    }
    process.stdout.write(`${JSON.stringify(redact(entry))}\n`)
  }

  override log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('log', message, optionalParams)
  }

  override warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams)
  }

  override error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams)
  }

  override debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams)
  }

  override verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('verbose', message, optionalParams)
  }

  override fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write('fatal', message, optionalParams)
  }
}
