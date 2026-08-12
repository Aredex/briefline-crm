/*
 * LAND-SEC-008: About this case study (F3/T3.3)
 * Replaces the metadata <dl> (AUD-009) with a three-moment teaser plus a
 * scope line and an honesty line. "Read the full case study" points at the
 * English PRD (docs/02-prd.en.md) — the closest existing document to a case
 * study narrative; no standalone /case-study route exists yet (decision
 * recorded here rather than left as a TODO, plan T3.3).
 */
const MOMENTS = [
  {
    number: '01',
    title: 'Ambiguous brief',
    body: 'A freelance listing asked for a CRM-style task manager.',
  },
  {
    number: '02',
    title: 'Product decisions',
    body: 'Scope, roles, permissions, data model, API contract and accessible board.',
  },
  {
    number: '03',
    title: 'Working outcome',
    body: 'Public demo, documented architecture, reproducible tests and deployment.',
  },
]

export function CaseStudy() {
  return (
    <section className="landing-section landing-section--alt" aria-labelledby="case-title">
      <div className="landing-section__inner">
        <div className="landing-section__header">
          <h2 id="case-title" className="landing-section__title">About this case study</h2>
        </div>

        <ol className="landing-case-moments">
          {MOMENTS.map((moment) => (
            <li key={moment.number} className="landing-case-moment">
              <span className="landing-case-moment__number" aria-hidden="true">{moment.number}</span>
              <h3>{moment.title}</h3>
              <p>{moment.body}</p>
            </li>
          ))}
        </ol>

        <p className="landing-case-scope">
          I owned product definition, UX direction, frontend, backend, data, testing, and deployment.
        </p>
        <p className="landing-case-honesty">
          This is an independent portfolio case study inspired by a marketplace brief, not
          commissioned client work.
        </p>

        <div className="landing-evidence-ref-group">
          <p className="landing-evidence-ref">
            <span className="landing-evidence-ref__label">Read the full case study</span>
            <code className="landing-evidence-ref__path">docs/02-prd.en.md</code>
          </p>
          <p className="landing-evidence-ref">
            <span className="landing-evidence-ref__label">View the development plan</span>
            <code className="landing-evidence-ref__path">docs/plans/04-development-plan.en.md</code>
          </p>
        </div>
      </div>
    </section>
  )
}
