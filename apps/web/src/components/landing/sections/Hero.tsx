import { Link } from 'react-router'

/* LAND-SEC-001: Hero */
export function Hero() {
  return (
    <section className="landing-hero" aria-labelledby="hero-title">
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
        <img src="/hero-board.png" alt="Briefline task board showing backlog, pending, in progress, blocked, and completed columns with tasks, priorities, and assignees visible" width={640} height={420} />
      </div>
    </section>
  )
}
