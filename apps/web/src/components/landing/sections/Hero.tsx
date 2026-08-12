import { Link } from 'react-router'

/* LAND-SEC-001: Hero */
export function Hero() {
  return (
    <section className="landing-hero" aria-labelledby="hero-title">
      <div className="landing-hero__grid">
        <div className="landing-hero__content">
          <p className="landing-hero__eyebrow">Full-stack portfolio case study</p>
          <h1 id="hero-title" className="landing-hero__title">Client work, clearly owned.</h1>
          <p className="landing-hero__text">
            Briefline connects client context, priorities, ownership, and change history
            in one focused workspace for small digital agencies.
          </p>
          <div className="landing-hero__actions">
            <Link to="/login" className="landing-hero__cta-primary">Open live demo</Link>
            {/* T5.4/FUN-004: the label says "case study", so it should land
                on the actual #case-study anchor, not #engineering. */}
            <a href="#case-study" className="landing-hero__cta-secondary">View case study</a>
          </div>
          {/* QA F5 (#1): the cold-start warmup notice used to live here,
              triggered by this link's onClick — but the click navigates to
              /login in the same tick, unmounting Hero before the first ping
              could ever resolve. It now lives on Login.tsx, which actually
              stays mounted through the check. */}
          <p className="landing-hero__note">
            Try the administrator and member accounts. All data is fictional and resets daily.
          </p>
        </div>
        <div className="landing-hero__image">
          <picture>
            <source
              type="image/avif"
              srcSet="/media/board-overview.avif 1x, /media/board-overview@2x.avif 2x"
            />
            <source
              type="image/webp"
              srcSet="/media/board-overview.webp 1x, /media/board-overview@2x.webp 2x"
            />
            <img
              src="/media/board-overview.webp"
              alt="Briefline task board showing backlog, pending, in progress, blocked, and completed columns with tasks, priorities, and assignees visible"
              width={1146}
              height={815}
              loading="eager"
              fetchPriority="high"
            />
          </picture>
        </div>
      </div>
      <p className="landing-hero__proof">
        <span>Admin + Member</span>
        <span>Daily reset</span>
        <span>OpenAPI</span>
      </p>
    </section>
  )
}
