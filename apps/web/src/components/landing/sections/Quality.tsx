/* LAND-SEC-007: Quality */
export function Quality() {
  return (
    <section id="quality" className="landing-section" aria-labelledby="quality-title">
      <div className="landing-section__inner">
        <div className="landing-section__header">
          <h2 id="quality-title" className="landing-section__title">Quality and accessibility</h2>
          <p className="landing-section__subtitle">Evidence, not claims.</p>
        </div>
        <ul className="landing-quality">
          <li>WCAG 2.2 AA target</li>
          <li>Keyboard-complete task movement</li>
          <li>Accessible alternative to drag-and-drop</li>
          <li>PostgreSQL integration tests</li>
          <li>Negative authorization tests</li>
          <li>Playwright end-to-end journeys</li>
          <li>Daily demo reset</li>
        </ul>
      </div>
    </section>
  )
}
