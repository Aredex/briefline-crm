/*
 * AppShell — app frame: skip link, <header> with brand + role-based nav,
 * <main id="main"> landmark, mobile drawer navigation. Rendered by the router
 * as the protected layout; 403/404 pages reuse it via the children prop.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../providers/AuthProvider'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { IconChevronDown, IconLogOut, IconMenu, IconShield, IconUser } from '../ui/icons'

export interface NavItem {
  to: string
  label: string
  adminOnly?: boolean
  /** NavLink end prop — exact-match only (PC-02: "Tasks" vs "/tasks/list"). */
  end?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/tasks', label: 'Tasks', end: true },
  { to: '/tasks/list', label: 'Task List' },
  { to: '/clients', label: 'Clients' },
  { to: '/contacts', label: 'Contacts' },
  { to: '/users', label: 'Users', adminOnly: true },
  { to: '/profile', label: 'Profile' },
]

/** Landing-page spec: secondary "About this project" block at the end of the nav. */
const GITHUB_REPO_URL = 'https://github.com/username/briefline-crm'
const APP_VERSION = 'v1.0.0'

/**
 * Secondary nav footer block: landing page, API docs, GitHub, and the app
 * version. Rendered at the end of the desktop nav and at the bottom of the
 * mobile drawer — visually separated from the main items via a divider.
 */
function AppAbout({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="app-about">
      <NavLink to="/" end className="app-about__link" onClick={onNavigate}>
        About this project
      </NavLink>
      <a href="/api/docs" className="app-about__link" onClick={onNavigate}>
        API docs
      </a>
      <a
        href={GITHUB_REPO_URL}
        target="_blank"
        rel="noreferrer"
        className="app-about__link"
        onClick={onNavigate}
      >
        GitHub
      </a>
      <span className="app-about__version">{APP_VERSION}</span>
    </div>
  )
}

interface AppShellProps {
  /** When provided (403/404 pages), render it inside <main> instead of <Outlet/>. */
  children?: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  // Close the user dropdown on outside click or Escape.
  useEffect(() => {
    if (!userMenuOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [userMenuOpen])

  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || user?.role === 'ADMIN')

  const handleLogout = async () => {
    setUserMenuOpen(false)
    setMobileNavOpen(false)
    try {
      await logout()
      // AUTH-FE-003: drop all cached server data before leaving (no user data
      // survives into the next session).
      queryClient.clear()
      navigate('/login', { replace: true })
    } catch {
      // Logout is best-effort; the UI shows the login screen regardless.
      queryClient.clear()
      navigate('/login', { replace: true })
    }
  }

  const navLinks = (onNavigate?: () => void) =>
    visibleItems.map((item) => (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        className={({ isActive }) => `app-nav__link${isActive ? ' is-active' : ''}`}
        onClick={onNavigate}
      >
        {item.label}
      </NavLink>
    ))

  const initials = user
    ? user.name
        .split(' ')
        .map((part) => part[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : ''

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>

      <header className="app-shell__header">
        <div className="app-shell__header-inner">
          <NavLink to="/dashboard" className="app-shell__brand">
            <span className="app-shell__logo" aria-hidden="true">
              <IconShield />
            </span>
            Briefline
          </NavLink>

          <nav className="app-shell__nav" aria-label="Main">
            {navLinks()}
            <AppAbout />
          </nav>

          <div className="app-shell__actions">
            <Button
              className="app-shell__menu-button"
              variant="ghost"
              size="md"
              leftIcon={<IconMenu />}
              aria-label="Open navigation menu"
              aria-haspopup="dialog"
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen(true)}
            />
            {user && (
              <div className="user-menu" ref={userMenuRef}>
                <button
                  type="button"
                  className="user-menu__trigger"
                  aria-haspopup="menu"
                  aria-expanded={userMenuOpen}
                  onClick={() => setUserMenuOpen((open) => !open)}
                >
                  <span className="user-menu__avatar" aria-hidden="true">
                    {initials}
                  </span>
                  <span className="user-menu__name">{user.name}</span>
                  <IconChevronDown className="user-menu__chevron" />
                </button>
                {userMenuOpen && (
                  <div className="user-menu__dropdown" role="menu" aria-label="User menu">
                    <NavLink to="/profile" className="user-menu__item" role="menuitem" onClick={() => setUserMenuOpen(false)}>
                      <IconUser /> Profile
                    </NavLink>
                    <button type="button" className="user-menu__item" role="menuitem" onClick={handleLogout}>
                      <IconLogOut /> Sign out
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="app-shell__main">
        {children ?? <Outlet />}
      </main>

      <Dialog
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        title="Navigation"
      >
        <nav className="app-shell__mobile-nav" aria-label="Main">
          {navLinks(() => setMobileNavOpen(false))}
          <hr className="app-shell__divider" />
          <button type="button" className="app-nav__link app-nav__link--button" onClick={handleLogout}>
            <IconLogOut /> Sign out
          </button>
          <hr className="app-shell__divider" />
          <AppAbout onNavigate={() => setMobileNavOpen(false)} />
        </nav>
      </Dialog>
    </div>
  )
}
