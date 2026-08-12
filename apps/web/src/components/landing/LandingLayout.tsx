/*
 * LandingLayout — public header + main + footer for the landing page.
 * Slim, no auth, no sidebar. Header becomes sticky after hero.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { IconMenu, IconShield, IconX } from '../ui/icons'

const NAV_SECTIONS = [
  { id: 'product', label: 'Product' },
  { id: 'workflow', label: 'Workflow' },
  { id: 'engineering', label: 'Engineering' },
  { id: 'quality', label: 'Quality' },
]
const NAV_SECTION_IDS = NAV_SECTIONS.map(section => section.id)

function PublicHeader() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [sticky, setSticky] = useState(false)
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const headerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const sentinel = document.getElementById('hero-sentinel')
    if (!sentinel) return
    // rootMargin delays the sticky trigger until ~100px of scroll (T1.6: 80-120px),
    // instead of firing the instant the zero-height sentinel leaves the viewport.
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry) setSticky(!entry.isIntersecting) },
      { threshold: 0, rootMargin: '-100px 0px 0px 0px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const sections = NAV_SECTION_IDS
      .map(id => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null)
    if (sections.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter(entry => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible) setActiveSection(visible.target.id)
      },
      { rootMargin: '-40% 0px -50% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] },
    )
    sections.forEach(section => observer.observe(section))
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
          {NAV_SECTIONS.map(({ id, label }) => (
            <a
              key={id}
              href={`#${id}`}
              aria-current={activeSection === id ? 'true' : undefined}
              onClick={() => setMenuOpen(false)}
            >
              {label}
            </a>
          ))}
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
            {/* D1: the repo isn't published yet — no placeholder GitHub link.
                Re-add once a real URL exists; never a `#` stand-in (FUN-006). */}
            <a href="/accessibility">Accessibility</a>
          </div>
        </div>
      </div>

      <div className="landing-footer__bottom">
        <p>© {year} Built as a portfolio case study. Inspired by a real freelance brief. Fictional company and data.</p>
        <p className="landing-footer__status">
          <span className="landing-footer__status-dot" aria-hidden="true" />
          v1.0.0 · Live demo
        </p>
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
