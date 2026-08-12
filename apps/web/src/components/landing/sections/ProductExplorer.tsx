import { useState } from 'react'

const TABS = [
  { key: 'plan', label: 'Plan work', title: 'Client context and backlog', desc: 'Every task starts with a client and a brief. Prioritize in the backlog, assign ownership, and set due dates before work begins.' },
  { key: 'coordinate', label: 'Coordinate delivery', title: 'Track and move work', desc: 'Filter by status, priority, or assignee. Drag cards between columns or use the keyboard menu. Every status change is recorded.' },
  { key: 'accountability', label: 'Keep accountability', title: 'Permissions and history', desc: 'Members see their work. Admins manage users and archives. Every change is traceable with old and new values in the task timeline.' },
]

/* LAND-SEC-004: Real product */
export function ProductExplorer() {
  const [activeTab, setActiveTab] = useState(TABS[0]!.key)

  return (
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
  )
}
