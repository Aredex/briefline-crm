/*
 * LandingLayout — public header + main + footer for the landing page.
 * Slim, no auth, no sidebar. Header becomes sticky after hero.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { IconMenu, IconShield, IconX } from '../ui/icons'

function PublicHeader() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [sticky, setSticky] = useState(false)
  const headerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const sentinel = document.getElementById('hero-sentinel')
    if (!sentinel) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry) setSticky(!entry.isIntersecting) },
      { threshold: 0 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMenuOpen(false); document.getElementById('menu-toggle')?.focus() }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [menuOpen])

  return (
    <header ref={headerRef} className={`landing-header${sticky ? ' landing-header--sticky' : ''}`}>
      <div className="landing-header__inner">
        <Link to="/" className="landing-header__brand" aria-label="Briefline home">
          <span className="landing-header__logo" aria-hidden="true"><IconShield /></span>
          <span className="landing-header__wordmark">Briefline</span>
        </Link>

        <nav className={`landing-header__nav${menuOpen ? ' is-open' : ''}`} aria-label="Main">
          <a href="#product" onClick={() => setMenuOpen(false)}>Product</a>
          <a href="#workflow" onClick={() => setMenuOpen(false)}>Workflow</a>
          <a href="#engineering" onClick={() => setMenuOpen(false)}>Engineering</a>
          <a href="#quality" onClick={() => setMenuOpen(false)}>Quality</a>
        </nav>

        <div className="landing-header__actions">
          <Link to="/login" className="landing-header__cta">Open live demo</Link>
          <button
            id="menu-toggle"
            type="button"
            className="landing-header__menu-btn"
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(v => !v)}
          >
            {menuOpen ? <IconX /> : <IconMenu />}
          </button>
        </div>
      </div>
    </header>
  )
}

function PublicFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="landing-footer" role="contentinfo">
      <div className="landing-footer__inner">
        <div className="landing-footer__identity">
          <span className="landing-footer__brand">Briefline</span>
          <p className="landing-footer__desc">A full-stack CRM workflow case study for small digital agencies.</p>
        </div>

        <div className="landing-footer__links">
          <div className="landing-footer__col">
            <h3 className="landing-footer__heading">Product</h3>
            <a href="/login">Live demo</a>
            <a href="/api/docs">API documentation</a>
          </div>
          <div className="landing-footer__col">
            <h3 className="landing-footer__heading">Project</h3>
            <a href="https://github.com/username/briefline-crm">GitHub repository</a>
            <a href="/accessibility">Accessibility</a>
          </div>
        </div>
      </div>

      <div className="landing-footer__bottom">
        <p>© {year} Built as a portfolio case study. Inspired by a real freelance brief. Fictional company and data.</p>
      </div>
    </footer>
  )
}

export function LandingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="landing">
      <a className="skip-link" href="#main">Skip to main content</a>
      <PublicHeader />
      <main id="main" tabIndex={-1}>{children}</main>
      <PublicFooter />
    </div>
  )
}
