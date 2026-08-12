/*
 * LAND-SEC-006: Engineering (F3/T3.1)
 * Replaces the flat technology <ul> (AUD-006) with a small architecture
 * diagram plus four decisions, each backed by a real file in this repo
 * (plan D3 — .claude/plans/* stays where it is). These are repo paths, not
 * <a href>s: the deployed SPA has no route that serves raw .md/.yaml files,
 * so a live anchor would 404 or silently reload the landing. Until D1 (repo
 * published on GitHub) resolves, they render as evidence-ref text — real
 * proof the decision exists on disk, without a broken clickable link
 * (audit §22 "no placeholder links" / FUN-006).
 */
interface Decision {
  title: string
  description: string
  code?: string
  evidence: { label: string; href: string }
}

const DECISIONS: Decision[] = [
  {
    title: 'Contract-first integration',
    description:
      'OpenAPI 3.1 defines every request and response. Frontend types are generated from the contract, not hand-maintained.',
    evidence: { label: 'Inspect the API contract', href: 'packages/api-contract/openapi.yaml' },
  },
  {
    title: 'Server-enforced permissions',
    description:
      'Global authentication plus object-level policies: a member can only edit tasks they own or are assigned to — checked on the server, not just hidden in the UI.',
    evidence: { label: 'Read the permission matrix', href: '.claude/plans/permission-matrix.md' },
  },
  {
    title: 'Atomic change history',
    description:
      'A task mutation and its TaskChange record are written inside one transaction, so no field change is ever logged without the record it changed.',
    code: `await tx.task.update({ where: { id, version }, data })
await tx.taskChange.create({ data: changeEntry })
// one $transaction — both commit, or neither does`,
    evidence: { label: 'View the data model', href: '.claude/plans/data-model.md' },
  },
  {
    title: 'Conflict-safe interactions',
    description:
      'Every mutating request carries expectedVersion. A stale write never overwrites silently — it returns 409 with the current server state.',
    code: `UPDATE "Task" SET ..., version = version + 1
WHERE id = $1 AND version = $2
-- rowCount = 0 → 409 STALE_VERSION, current state attached`,
    evidence: { label: 'Read ADR-004', href: '.claude/plans/adrs.md#adr-004-concurrency' },
  },
]

export function Engineering() {
  return (
    <section id="engineering" className="landing-section landing-section--alt" aria-labelledby="eng-title">
      <div className="landing-section__inner">
        <div className="landing-section__header">
          <h2 id="eng-title" className="landing-section__title">Engineering</h2>
          <p className="landing-section__subtitle">
            The portfolio value is in the decisions: contract-first integration, server-enforced
            permissions, atomic history, and conflict-safe updates.
          </p>
        </div>

        <div className="landing-eng-diagram">
          <p className="sr-only">
            The React application talks to the NestJS API through an OpenAPI contract. The API
            persists everything to PostgreSQL.
          </p>
          <div className="landing-eng-diagram__top" aria-hidden="true">
            <span className="landing-eng-diagram__node">React application</span>
            <span className="landing-eng-diagram__edge">
              <span className="landing-eng-diagram__edge-label">OpenAPI contract</span>
              <span className="landing-eng-diagram__edge-line" />
            </span>
            <span className="landing-eng-diagram__node">NestJS API</span>
          </div>
          <div className="landing-eng-diagram__stems" aria-hidden="true">
            <span className="landing-eng-diagram__stem-label">Query cache · Forms + a11y</span>
            <span className="landing-eng-diagram__stem-label">Auth + policies · Transactions</span>
          </div>
          <div className="landing-eng-diagram__bottom" aria-hidden="true">
            <span className="landing-eng-diagram__node landing-eng-diagram__node--db">PostgreSQL</span>
          </div>
        </div>

        <ol className="landing-eng-decisions">
          {DECISIONS.map((decision) => (
            <li key={decision.title} className="landing-eng-decision">
              <h3>{decision.title}</h3>
              <p>{decision.description}</p>
              {decision.code && (
                <pre className="landing-eng-decision__code">
                  <code>{decision.code}</code>
                </pre>
              )}
              <p className="landing-evidence-ref">
                <span className="landing-evidence-ref__label">{decision.evidence.label}</span>
                <code className="landing-evidence-ref__path">{decision.evidence.href}</code>
              </p>
            </li>
          ))}
        </ol>

        <p className="landing-eng-stack">
          <span className="sr-only">Built with: </span>
          React 19 · TypeScript · NestJS · PostgreSQL · Prisma · JWT cookie auth · CSRF protection
        </p>
      </div>
    </section>
  )
}
