/* LAND-SEC-006: Engineering */
export function Engineering() {
  return (
    <section id="engineering" className="landing-section landing-section--alt" aria-labelledby="eng-title">
      <div className="landing-section__inner">
        <div className="landing-section__header">
          <h2 id="eng-title" className="landing-section__title">Engineering</h2>
          <p className="landing-section__subtitle">Built with modern tools and documented decisions.</p>
        </div>
        <ul className="landing-eng">
          <li>React 19 + TypeScript</li>
          <li>NestJS REST API</li>
          <li>PostgreSQL + Prisma</li>
          <li>OpenAPI contract</li>
          <li>JWT cookie authentication and CSRF protection</li>
          <li>Object-level authorization</li>
          <li>Transactional change history</li>
          <li>Optimistic concurrency control</li>
          <li>Automated and manual accessibility testing</li>
          <li>Reproducible public deployment</li>
        </ul>
        <div className="landing-eng__actions">
          <a href="https://github.com/username/briefline-crm" className="landing-link landing-link--outline">View the repository</a>
        </div>
      </div>
    </section>
  )
}
