import { Component, type ErrorInfo, type ReactNode } from 'react'
import ErrorFallback from './ErrorFallback'

interface State {
  hasError: boolean
}

/**
 * Minimal error boundary for catching unhandled rendering errors and showing
 * a graceful fallback UI instead of a blank page. Intentionally local-only:
 * errors are logged to the browser console so they surface during dev and in
 * user-side debugging, but are not sent to any external service.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Rendering error caught by ErrorBoundary:', error, info)
  }

  render() {
    return this.state.hasError ? <ErrorFallback /> : this.props.children
  }
}
