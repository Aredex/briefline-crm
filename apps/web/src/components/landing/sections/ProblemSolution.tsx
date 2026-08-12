/* LAND-SEC-002: Problem & Solution */
export function ProblemSolution() {
  return (
    <section id="product" className="landing-section landing-section--alt" aria-labelledby="product-title">
      <div className="landing-section__inner">
        <div className="landing-section__header">
          <h2 id="product-title" className="landing-section__title">When client work lives everywhere</h2>
          <p className="landing-section__subtitle">Briefline replaces scattered spreadsheets and chat threads with one operational view.</p>
        </div>
        <div className="landing-compare">
          <div className="landing-compare__col landing-compare__col--problem">
            <h3>Without a shared system</h3>
            <ul>
              <li>Ownership becomes unclear</li>
              <li>Priorities drift</li>
              <li>Blocked work loses context</li>
              <li>Important changes disappear into chat history</li>
            </ul>
          </div>
          <div className="landing-compare__col landing-compare__col--solution">
            <h3>With Briefline</h3>
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
