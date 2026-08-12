import { Link } from 'react-router'

/*
 * LAND-SEC-009: Final CTA (F3/T3.4)
 * The "Prefer the code? View the repository" link from the audit spec is
 * intentionally omitted: the repo isn't published yet (plan D1). No node is
 * rendered for it — not a disabled link, not a `#` placeholder.
 */
export function FinalCta() {
  return (
    <section className="landing-section" aria-labelledby="cta-title">
      <div className="landing-section__inner landing-cta">
        <h2 id="cta-title">See how Briefline turns client context into accountable work.</h2>
        <p className="landing-cta__support">
          Use the administrator account to manage the full workspace, or the member account to
          test ownership-based permissions. No registration required.
        </p>
        <div className="landing-cta__actions">
          <Link to="/login?demo=admin" className="landing-link">Open administrator demo</Link>
          <Link to="/login?demo=member" className="landing-link landing-link--outline">Open member demo</Link>
        </div>
        <div className="landing-cta__notices">
          <p>Demo data resets daily.</p>
          <p>First load may take up to 60 seconds on the free hosting tier.</p>
        </div>
      </div>
    </section>
  )
}
