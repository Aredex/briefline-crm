/*
 * ErrorState — failed data-load screen with retry. Shows the traceId when
 * available so users can reference it in support requests.
 */
import { IconAlertTriangle } from './icons'

export interface ErrorStateProps {
  title?: string
  message?: string
  /** API traceId (Problem Details) shown as an unobtrusive footnote. */
  traceId?: string
  onRetry?: () => void
  retryLabel?: string
}

export function ErrorState({
  title = 'Something went wrong',
  message = 'We could not load this data. Please try again.',
  traceId,
  onRetry,
  retryLabel = 'Try again',
}: ErrorStateProps) {
  return (
    <div className="error-state" role="alert">
      <span className="error-state__icon" aria-hidden="true">
        <IconAlertTriangle />
      </span>
      <h3 className="error-state__title">{title}</h3>
      <p className="error-state__message">{message}</p>
      {onRetry && (
        <button type="button" className="btn btn--secondary btn--sm" onClick={onRetry}>
          {retryLabel}
        </button>
      )}
      {traceId && <p className="error-state__trace">Reference: {traceId}</p>}
    </div>
  )
}
