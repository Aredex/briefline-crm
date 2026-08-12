import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router'
import { LandingLightbox } from '../LandingLightbox'

/*
 * Deep-link ids (T2.5, plan A7): the login gate already supports
 * `?next=<path>` (router.tsx requireAuth). These ids are deterministic seed
 * data (apps/api/prisma/seed.ts, SEED_IDS) so they resolve to real records:
 *   - t213 "Website redesign: home hero" — history-rich task (comments,
 *     checklist, field changes) for the accountability tab.
 *   - c101 "Nova Cloudworks" — the client both t201 (backlog) and t213 live
 *     under, so the client-record link and the task links point at one
 *     consistent story.
 */
const TASK_HISTORY_ID = '00000000-0000-4000-8000-000000000213'
const CLIENT_ID = '00000000-0000-4000-8000-000000000101'

interface TabDef {
  key: string
  label: string
  title: string
  proofPoints: string[]
  media: { base: string; width: number; height: number; alt: string; caption: string }
  cta: { label: string; next: string }
  secondaryCta?: { label: string; next: string }
}

const TABS: TabDef[] = [
  {
    key: 'plan',
    label: 'Plan work',
    title: 'Client context and backlog',
    proofPoints: [
      'Client context travels with the task',
      'Backlog work can remain unassigned',
      'Active work requires an owner before it can move',
    ],
    media: {
      base: 'client-detail',
      width: 1152,
      height: 740,
      alt: 'Client detail screen for Nova Cloudworks showing contacts, related tasks, and change history',
      caption: 'Client record for Nova Cloudworks, with related tasks and contacts in one view.',
    },
    cta: { label: 'Open backlog in demo', next: '/tasks/list?status=BACKLOG' },
    secondaryCta: { label: 'View the client record', next: `/clients/${CLIENT_ID}` },
  },
  {
    key: 'coordinate',
    label: 'Coordinate delivery',
    title: 'Track and move work',
    proofPoints: [
      'Filter by assignee, priority, or status instantly',
      'Move cards by drag-and-drop or the accessible "Move to…" menu',
      'Every status change is written to the task’s history',
    ],
    media: {
      base: 'board-overview',
      width: 1146,
      height: 815,
      alt: 'Task board with backlog, pending, in progress, blocked, and completed columns',
      caption: 'The task board: backlog through completed, with priority and assignee visible on every card.',
    },
    cta: { label: 'Open task board', next: '/tasks' },
  },
  {
    key: 'accountability',
    label: 'Keep accountability',
    title: 'Permissions and history',
    proofPoints: [
      'Every field change is logged with old and new values',
      'Comments, checklist items, and labels stay attached to the task',
      'Permissions are enforced by the API, not just hidden in the UI',
    ],
    media: {
      base: 'task-history',
      width: 520,
      height: 1574,
      alt: 'Task detail drawer showing a full change history timeline with old and new values',
      caption: 'Task history for "Website redesign: home hero" — every field change, timestamped and attributed.',
    },
    cta: { label: 'Inspect task history', next: `/tasks/${TASK_HISTORY_ID}` },
  },
]

const EXPLORER_ANCHOR = 'explore-product'

/**
 * T2.4: tab state lives in the URL fragment as `#explore-product?tab=<key>`
 * so a tab can be shared or bookmarked directly. This is a deliberately
 * distinct anchor from `#product` (still owned by ProblemSolution, H5 —
 * renaming anchors is F5/T5.4, out of scope here), so the two don't collide.
 */
function readTabFromHash(): string | null {
  const hash = window.location.hash
  if (!hash.startsWith(`#${EXPLORER_ANCHOR}`)) return null
  const queryIndex = hash.indexOf('?')
  if (queryIndex === -1) return null
  const tab = new URLSearchParams(hash.slice(queryIndex + 1)).get('tab')
  return tab && TABS.some((t) => t.key === tab) ? tab : null
}

function MediaPicture({ media }: { media: TabDef['media'] }) {
  return (
    <picture>
      <source
        type="image/avif"
        srcSet={`/media/${media.base}.avif 1x, /media/${media.base}@2x.avif 2x`}
      />
      <source
        type="image/webp"
        srcSet={`/media/${media.base}.webp 1x, /media/${media.base}@2x.webp 2x`}
      />
      <img
        src={`/media/${media.base}.webp`}
        alt={media.alt}
        width={media.width}
        height={media.height}
        loading="lazy"
      />
    </picture>
  )
}

/* LAND-SEC-004: Real product */
export function ProductExplorer() {
  const [activeTab, setActiveTab] = useState<string>(() => readTabFromHash() ?? TABS[0]!.key)
  const [lightboxTab, setLightboxTab] = useState<TabDef | null>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  // A deep link that lands on this section's hash on first paint should
  // scroll it into view — the browser can't do this on its own because the
  // fragment also carries the `?tab=` query, so it never matches an element id.
  useEffect(() => {
    if (readTabFromHash()) sectionRef.current?.scrollIntoView({ block: 'start' })
  }, [])

  function selectTab(key: string, moveFocus = false) {
    setActiveTab(key)
    window.history.replaceState(null, '', `#${EXPLORER_ANCHOR}?tab=${key}`)
    if (moveFocus) tabRefs.current[key]?.focus()
  }

  /* WAI-ARIA APG tabs pattern (automatic activation): arrow keys move focus
     AND select; Home/End jump to the first/last tab. */
  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % TABS.length
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + TABS.length) % TABS.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = TABS.length - 1
    if (nextIndex === null) return
    event.preventDefault()
    selectTab(TABS[nextIndex]!.key, true)
  }

  const active = TABS.find((t) => t.key === activeTab) ?? TABS[0]!

  return (
    <section
      ref={sectionRef}
      id={EXPLORER_ANCHOR}
      className="landing-section landing-section--alt"
      aria-labelledby="preview-title"
    >
      <div className="landing-section__inner">
        <div className="landing-section__header">
          <h2 id="preview-title" className="landing-section__title">Explore the product</h2>
          <p className="landing-section__subtitle">Real screens from the working application — not mockups.</p>
        </div>

        <div className="landing-tabs" role="tablist" aria-label="Product previews">
          {TABS.map((tab, index) => (
            <button
              key={tab.key}
              ref={(el) => { tabRefs.current[tab.key] = el }}
              type="button"
              role="tab"
              id={`tab-${tab.key}`}
              aria-selected={activeTab === tab.key}
              aria-controls={`panel-${tab.key}`}
              tabIndex={activeTab === tab.key ? 0 : -1}
              className={`landing-tabs__btn${activeTab === tab.key ? ' landing-tabs__btn--active' : ''}`}
              onClick={() => selectTab(tab.key)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id={`panel-${active.key}`}
          aria-labelledby={`tab-${active.key}`}
          tabIndex={0}
          className="landing-explorer-panel"
        >
          <button
            type="button"
            className="landing-explorer-media"
            onClick={() => setLightboxTab(active)}
            aria-label={`Enlarge screenshot: ${active.media.caption}`}
          >
            <MediaPicture media={active.media} />
            <span className="landing-explorer-media__hint" aria-hidden="true">Click to enlarge</span>
          </button>

          <div className="landing-explorer-copy">
            <h3>{active.title}</h3>
            <ul className="landing-explorer-proof">
              {active.proofPoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <div className="landing-explorer-ctas">
              <Link to={`/login?next=${encodeURIComponent(active.cta.next)}`} className="landing-explorer-cta">
                {active.cta.label}
              </Link>
              {active.secondaryCta && (
                <Link
                  to={`/login?next=${encodeURIComponent(active.secondaryCta.next)}`}
                  className="landing-explorer-cta-secondary"
                >
                  {active.secondaryCta.label}
                </Link>
              )}
            </div>
          </div>
        </div>

        <p className="landing-note">Explore the complete workflow in the live demo.</p>
      </div>

      {lightboxTab && (
        <LandingLightbox caption={lightboxTab.media.caption} onClose={() => setLightboxTab(null)}>
          <MediaPicture media={lightboxTab.media} />
        </LandingLightbox>
      )}
    </section>
  )
}
