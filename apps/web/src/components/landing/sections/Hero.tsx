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
            <a href="#engineering" className="landing-hero__cta-secondary">View case study</a>
          </div>
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
