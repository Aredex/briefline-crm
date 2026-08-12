import { Link } from 'react-router'

/* LAND-SEC-009: Final CTA */
export function FinalCta() {
  return (
    <section className="landing-section" aria-labelledby="cta-title">
      <div className="landing-section__inner landing-cta">
        <h2 id="cta-title">See how Briefline turns client context into accountable work.</h2>
        <div className="landing-cta__actions">
          <Link to="/login" className="landing-link">Open administrator demo</Link>
          <Link to="/login" className="landing-link landing-link--outline">Open member demo</Link>
        </div>
      </div>
    </section>
  )
}
