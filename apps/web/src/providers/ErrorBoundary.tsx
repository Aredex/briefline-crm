/*
 * App-wide render error boundary — last line of defense. Shows a recoverable
 * fallback instead of a white screen. Errors during rendering (not data
 * fetching) land here; data errors are handled by ErrorState/errorElement.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Production logging hook — replace with the project's error reporter when available.
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  private handleRetry = () => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      return (
        <main
          role="main"
          style={{
            display: 'flex',
            minHeight: '100vh',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div style={{ maxWidth: 480, textAlign: 'center' }}>
            <h1 style={{ fontSize: '1.5rem', marginBottom: 8 }}>Something went wrong</h1>
            <p style={{ color: '#4b5563', marginBottom: 16 }}>
              An unexpected error occurred while rendering this page. Your work has not been
              affected.
            </p>
            <button
              type="button"
              onClick={this.handleRetry}
              style={{
                minHeight: 44,
                padding: '0 16px',
                borderRadius: 6,
                border: 'none',
                background: '#2563eb',
                color: '#fff',
                fontWeight: 600,
              }}
            >
              Try again
            </button>
          </div>
        </main>
      )
    }
    return this.props.children
  }
}
