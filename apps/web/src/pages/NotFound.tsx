/*
 * NotFound — 404. Rendered inside the app shell when authenticated, standalone
 * otherwise. Offers a way back in both cases.
 */
import { Link } from 'react-router'
import { AppShell } from '../components/layout/AppShell'
import { IconSearch } from '../components/ui/icons'
import { useAuth } from '../providers/AuthProvider'

function NotFoundContent() {
  return (
    <section className="error-page">
      <span className="error-page__icon" aria-hidden="true">
        <IconSearch />
      </span>
      <h1 className="error-page__title">Page not found</h1>
      <p className="error-page__message">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link className="btn btn--primary btn--md" to="/dashboard">
        Back to dashboard
      </Link>
    </section>
  )
}

export function NotFound() {
  const { user } = useAuth()
  if (user) return <AppShell children={<NotFoundContent />} />
  return <NotFoundContent />
}
