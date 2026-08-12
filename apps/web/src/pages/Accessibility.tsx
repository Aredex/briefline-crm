/*
 * Accessibility — public page at /accessibility (F3/T3.5, FUN-009).
 * Previously a footer link with no matching route (H7): it fell through to
 * NotFound. Reuses LandingLayout so the public header/footer stay consistent
 * with the rest of the marketing site.
 */
import { LandingLayout } from '../components/landing/LandingLayout'
import '../components/landing/Landing.css'

const LAST_REVIEWED = 'August 12, 2026'

export function Accessibility() {
  return (
    <LandingLayout>
      <section className="landing-section landing-legal" aria-labelledby="a11y-title">
        <div className="landing-section__inner landing-legal__inner">
          <h1 id="a11y-title" className="landing-section__title">Accessibility</h1>
          <p className="landing-section__subtitle landing-legal__intro">
            Briefline CRM is a portfolio project built with accessibility as a functional
            requirement, not an afterthought. This page explains the target, what has been
            verified, and what is known to still be incomplete.
          </p>

          <h2>Target</h2>
          <p>
            The application and this public site target <strong>WCAG 2.2 Level AA</strong>. That
            target applies to both the authenticated app (board, task detail, forms) and this
            marketing site.
          </p>

          <h2>What has been verified manually</h2>
          <ul>
            <li>Full keyboard operation of the task board, including moving a card between
              columns without drag-and-drop (an accessible &ldquo;Move to&hellip;&rdquo; menu is
              always available).</li>
            <li>Focus order and visible focus states across forms, dialogs, and the product
              explorer tabs on this page.</li>
            <li>Screen reader pass over primary flows: sign in, task board, task detail history,
              and client records.</li>
            <li>Color contrast of body text and interactive states against both the app and
              landing palettes (4.5:1 minimum).</li>
            <li>Zoom up to 400% and a 320px viewport without introducing horizontal scrolling on
              the page body.</li>
            <li><code>prefers-reduced-motion</code> removes non-essential animation and smooth
              scrolling.</li>
          </ul>

          <h2>Known limitations</h2>
          <ul>
            <li>Automated axe-core coverage does not yet run against every authenticated screen —
              some newer views (comments, labels, checklist) have manual but not automated
              coverage.</li>
            <li>No dedicated screen reader testing has been done with JAWS; verification so far
              has used VoiceOver and NVDA.</li>
            <li>Some data tables collapse to horizontal scroll on narrow viewports rather than an
              alternative card layout.</li>
          </ul>

          <h2>Reporting a problem</h2>
          <p>
            This is an independent portfolio project without a support inbox. If you find an
            accessibility issue, the most useful path is opening an issue against the source
            repository once it is public, or reaching out through the contact details on the
            author&rsquo;s portfolio.
          </p>

          <p className="landing-legal__reviewed">Last reviewed: {LAST_REVIEWED}.</p>
        </div>
      </section>
    </LandingLayout>
  )
}
