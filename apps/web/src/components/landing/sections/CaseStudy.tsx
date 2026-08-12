/* LAND-SEC-008: Case study */
export function CaseStudy() {
  return (
    <section className="landing-section landing-section--alt" aria-labelledby="case-title">
      <div className="landing-section__inner">
        <div className="landing-section__header">
          <h2 id="case-title" className="landing-section__title">About this case study</h2>
        </div>
        <dl className="landing-case-study">
          <dt>Context</dt>
          <dd>Inspired by a freelance marketplace brief.</dd>
          <dt>Challenge</dt>
          <dd>Transform an ambiguous request into a credible product.</dd>
          <dt>Role</dt>
          <dd>Product definition, UX, frontend, backend, data, testing, and deployment.</dd>
          <dt>Constraints</dt>
          <dd>Public demo, two roles, realistic scope, and low-cost hosting.</dd>
          <dt>Outcome</dt>
          <dd>A deployed working product with documented engineering decisions.</dd>
        </dl>
      </div>
    </section>
  )
}
