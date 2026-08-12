/*
 * Landing — public case-study page at /.
 * Sections: Hero, Problem/Solution, Workflow, Product Previews, Roles,
 * Engineering, Quality, Case Study, Final CTA. All copy in English.
 */
import { useState } from 'react'
import { Link } from 'react-router'
import { LandingLayout } from '../components/landing/LandingLayout'
import '../components/landing/Landing.css'

const TABS = [
  { key: 'plan', label: 'Plan work', title: 'Client context and backlog', desc: 'Every task starts with a client and a brief. Prioritize in the backlog, assign ownership, and set due dates before work begins.' },
  { key: 'coordinate', label: 'Coordinate delivery', title: 'Track and move work', desc: 'Filter by status, priority, or assignee. Drag cards between columns or use the keyboard menu. Every status change is recorded.' },
  { key: 'accountability', label: 'Keep accountability', title: 'Permissions and history', desc: 'Members see their work. Admins manage users and archives. Every change is traceable with old and new values in the task timeline.' },
]

export function Landing() {
  const [activeTab, setActiveTab] = useState(TABS[0]!.key)

  return (
    <LandingLayout>
      {/* Sentinel for sticky header */}
      <div id="hero-sentinel" />

      {/* LAND-SEC-001: Hero */}
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

      {/* LAND-SEC-002: Problem & Solution */}
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

      {/* LAND-SEC-003: Workflow */}
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

      {/* LAND-SEC-004: Real product */}
      <section className="landing-section landing-section--alt" aria-labelledby="preview-title">
        <div className="landing-section__inner">
          <div className="landing-section__header">
            <h2 id="preview-title" className="landing-section__title">Explore the product</h2>
            <p className="landing-section__subtitle">Real screens from the working application — not mockups.</p>
          </div>
          <div className="landing-tabs" role="tablist" aria-label="Product previews">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                className={`landing-tabs__btn${activeTab === tab.key ? ' landing-tabs__btn--active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="landing-tab-content" role="tabpanel">
            <h3>{TABS.find(t => t.key === activeTab)?.title}</h3>
            <p>{TABS.find(t => t.key === activeTab)?.desc}</p>
          </div>
          <p className="landing-note">Explore the complete workflow in the live demo.</p>
        </div>
      </section>

      {/* LAND-SEC-005: Roles */}
      <section className="landing-section" aria-labelledby="roles-title">
        <div className="landing-section__inner">
          <div className="landing-section__header">
            <h2 id="roles-title" className="landing-section__title">Permissions that mean something</h2>
          </div>
          <div className="landing-roles-scroll">
            <table className="landing-roles-table">
              <caption>Capability matrix for Administrator and Member roles</caption>
              <thead>
                <tr>
                  <th scope="col">Capability</th>
                  <th scope="col">Administrator</th>
                  <th scope="col">Member</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>View team tasks</td><td className="yes">Yes</td><td className="yes">Yes</td></tr>
                <tr><td>Create tasks and clients</td><td className="yes">Yes</td><td className="yes">Yes</td></tr>
                <tr><td>Edit any task</td><td className="yes">Yes</td><td className="no">No</td></tr>
                <tr><td>Edit owned or assigned tasks</td><td className="yes">Yes</td><td className="yes">Yes</td></tr>
                <tr><td>Manage users</td><td className="yes">Yes</td><td className="no">No</td></tr>
                <tr><td>Archive records</td><td className="yes">Yes</td><td className="no">No</td></tr>
                <tr><td>View task history</td><td className="yes">Yes</td><td className="yes">Yes</td></tr>
              </tbody>
            </table>
          </div>
          <p className="landing-note landing-note--tight">Permissions are enforced by the API, not only hidden in the interface.</p>
        </div>
      </section>

      {/* LAND-SEC-006: Engineering */}
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

      {/* LAND-SEC-007: Quality */}
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

      {/* LAND-SEC-008: Case study */}
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

      {/* LAND-SEC-009: Final CTA */}
      <section className="landing-section" aria-labelledby="cta-title">
        <div className="landing-section__inner landing-cta">
          <h2 id="cta-title">See how Briefline turns client context into accountable work.</h2>
          <div className="landing-cta__actions">
            <Link to="/login" className="landing-link">Open administrator demo</Link>
            <Link to="/login" className="landing-link landing-link--outline">Open member demo</Link>
          </div>
        </div>
      </section>
    </LandingLayout>
  )
}
