/* LAND-SEC-002: Problem & Solution */
export function ProblemSolution() {
  return (
    <section id="product" className="landing-section landing-section--alt" aria-labelledby="product-title">
      <div className="landing-section__inner">
        <div className="landing-section__header">
          <h2 id="product-title" className="landing-section__title">When client work lives everywhere</h2>
          <p className="landing-section__subtitle">
            A client request starts in chat, priorities live in a spreadsheet, and delivery status
            depends on who remembers to update whom.
          </p>
        </div>
        <div className="landing-compare">
          <div className="landing-compare__col landing-compare__col--problem">
            <h3>Scattered work</h3>
            <ul>
              <li>Ownership becomes unclear</li>
              <li>Priorities drift</li>
              <li>Blocked work loses context</li>
              <li>Important changes disappear into chat history</li>
            </ul>
          </div>
          <div className="landing-compare__col landing-compare__col--solution">
            <h3>One operational view</h3>
            <div className="landing-compare__snapshot" aria-hidden="true">
              <p className="landing-compare__snapshot-client">Nova Cloudworks</p>
              <p className="landing-compare__snapshot-task">Website redesign: home hero</p>
              <p className="landing-compare__snapshot-meta">
                <span>Owner · Noah Patel</span>
                <span className="landing-compare__snapshot-status">In progress</span>
              </p>
            </div>
            <ul>
              <li>Every task has context</li>
              <li>Every active task has an owner</li>
              <li>Every important change is recorded</li>
              <li>Every role receives appropriate permissions</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
