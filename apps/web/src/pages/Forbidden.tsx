/*
 * Forbidden — 403. Rendered inside the app shell when authenticated (nav
 * stays usable), standalone otherwise. Never logs the user out (AUTH-FE-002).
 */
import { Link } from 'react-router'
import { AppShell } from '../components/layout/AppShell'
import { IconShield } from '../components/ui/icons'
import { useAuth } from '../providers/AuthProvider'

function ForbiddenContent() {
  return (
    <section className="error-page">
      <span className="error-page__icon" aria-hidden="true">
        <IconShield />
      </span>
      <h1 className="error-page__title">Access denied</h1>
      <p className="error-page__message">
        You do not have permission to view this page. Contact an administrator if you believe this
        is a mistake.
      </p>
      <Link className="btn btn--primary btn--md" to="/dashboard">
        Back to dashboard
      </Link>
    </section>
  )
}

export function Forbidden() {
  const { user } = useAuth()
  if (user) return <AppShell children={<ForbiddenContent />} />
  return <ForbiddenContent />
}
