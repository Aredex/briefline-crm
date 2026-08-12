/* LAND-SEC-003: Workflow */
export function Workflow() {
  return (
    <section id="workflow" className="landing-section" aria-labelledby="workflow-title">
      <div className="landing-section__inner">
        <div className="landing-section__header">
          <h2 id="workflow-title" className="landing-section__title">From client brief to accountable delivery</h2>
          <p className="landing-section__subtitle">The brief line connects every stage.</p>
        </div>
        <div className="landing-workflow">
          <div className="landing-workflow__step">
            <h3>Client</h3>
            <p>Brief and context — every task links to a client so you know who you are working for.</p>
          </div>
          <div className="landing-workflow__step">
            <h3>Backlog</h3>
            <p>Prioritize and assign — collect incoming work, set priorities, and assign ownership before it enters the active workflow.</p>
          </div>
          <div className="landing-workflow__step">
            <h3>Active work</h3>
            <p>Pending → In progress → Blocked — move tasks through states with drag-and-drop or keyboard controls.</p>
          </div>
          <div className="landing-workflow__step">
            <h3>Completed</h3>
            <p>Close or reopen — completed work can be reopened if requirements change.</p>
          </div>
          <div className="landing-workflow__step">
            <h3>Audited</h3>
            <p>Trace every important change — who changed what, when, and from which value to which value.</p>
          </div>
        </div>
      </div>
    </section>
  )
}
