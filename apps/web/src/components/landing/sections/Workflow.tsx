import { useEffect, useRef, useState } from 'react'

/*
 * LAND-SEC-003: Workflow (F4/T4.1, T4.2, T4.4, T4.5)
 *
 * Five numbered stages, alternating left/right (audit §9 ASCII). Each stage
 * carries a small real screenshot as evidence (T2's /media pipeline —
 * board-overview.webp is reused for Active work and Completed since both are
 * columns on the same board; there is no dedicated "completed" crop yet).
 *
 * Blocked is rendered as a side branch off "Active work", not as a sixth
 * numbered stage — audit §9: "Destacar Blocked como bifurcación temporal, no
 * como destino final". The spine (the brief line) stays a single continuous
 * path from 01 to 05; Blocked forks off it and returns.
 *
 * Reveal (T4.4/T4.5): steps fade/slide in via IntersectionObserver as they
 * scroll into view — the landing's only motion moment (audit §22 forbids
 * scroll animation on every section). The CSS default state is fully
 * visible; JS only opts a step INTO the hidden-then-reveal state, and only
 * when both IntersectionObserver and matchMedia are available and reduced
 * motion is off. That way: no JS, no IntersectionObserver support, or
 * reduced motion all fall back to "everything visible, no animation" without
 * any extra branching in the render path.
 */

interface Stage {
  number: string
  title: string
  action: string
  rule: string
  media: { base: string; width: number; height: number; alt: string }
}

const STAGES: Stage[] = [
  {
    number: '01',
    title: 'Client',
    action: 'Brief and context — every task links to a client so you know who you are working for.',
    rule: 'A task always carries its client context.',
    media: {
      base: 'client-detail',
      width: 1152,
      height: 740,
      alt: 'Client detail screen for Nova Cloudworks showing contacts and related tasks',
    },
  },
  {
    number: '02',
    title: 'Backlog',
    action:
      'Prioritize and assign — collect incoming work, set priorities, and assign ownership before it enters the active workflow.',
    rule: 'Backlog work can stay unassigned.',
    media: {
      base: 'backlog-view',
      width: 1168,
      height: 453,
      alt: 'Backlog list with unassigned tasks awaiting priority and ownership',
    },
  },
  {
    number: '03',
    title: 'Active work',
    action: 'Pending → In progress → Blocked — move tasks through states with drag-and-drop or keyboard controls.',
    rule: 'Active work requires an owner.',
    media: {
      base: 'board-overview',
      width: 1146,
      height: 815,
      alt: 'Task board with pending, in progress, blocked, and completed columns',
    },
  },
  {
    number: '04',
    title: 'Completed',
    action: 'Close or reopen — completed work can be reopened if requirements change.',
    rule: 'Completed is a state, not a deletion.',
    media: {
      base: 'board-overview',
      width: 1146,
      height: 815,
      alt: 'The same task board — completed work sits in its own column and can be reopened',
    },
  },
  {
    number: '05',
    title: 'Audited',
    action: 'Trace every important change — who changed what, when, and from which value to which value.',
    rule: 'Every important change is recorded.',
    media: {
      base: 'task-history',
      width: 520,
      height: 1574,
      alt: 'Task history timeline with old and new values, timestamped and attributed',
    },
  },
]

function StageMedia({ media }: { media: Stage['media'] }) {
  return (
    <picture>
      <source type="image/avif" srcSet={`/media/${media.base}.avif 1x, /media/${media.base}@2x.avif 2x`} />
      <source type="image/webp" srcSet={`/media/${media.base}.webp 1x, /media/${media.base}@2x.webp 2x`} />
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

/* T4.4/T4.5 — reveal state for the workflow steps. See file header. */
function useWorkflowReveal(count: number) {
  const stepRefs = useRef<(HTMLLIElement | null)[]>([])
  const [motionEnabled, setMotionEnabled] = useState(false)
  const [visible, setVisible] = useState<boolean[]>(() => Array(count).fill(false))

  useEffect(() => {
    const supportsObserver = typeof IntersectionObserver !== 'undefined'
    const reducesMotion =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!supportsObserver || reducesMotion) return

    setMotionEnabled(true)
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          const index = stepRefs.current.indexOf(entry.target as HTMLLIElement)
          if (index === -1) return
          setVisible((prev) => (prev[index] ? prev : prev.map((v, i) => (i === index ? true : v))))
          observer.unobserve(entry.target)
        })
      },
      { threshold: 0.25, rootMargin: '0px 0px -10% 0px' },
    )
    stepRefs.current.forEach((el) => { if (el) observer.observe(el) })
    return () => observer.disconnect()
  }, [count])

  return { stepRefs, motionEnabled, visible }
}

export function Workflow() {
  const { stepRefs, motionEnabled, visible } = useWorkflowReveal(STAGES.length)

  return (
    <section id="workflow" className="landing-section" aria-labelledby="workflow-title">
      <div className="landing-section__inner">
        <div className="landing-section__header">
          <h2 id="workflow-title" className="landing-section__title">From client brief to accountable delivery</h2>
          <p className="landing-section__subtitle">The brief line connects every stage, start to close.</p>
        </div>

        <ol className={`landing-workflow${motionEnabled ? ' landing-workflow--motion' : ''}`}>
          {STAGES.map((stage, index) => {
            const isLast = index === STAGES.length - 1
            const isActiveWork = stage.number === '03'
            return (
              <li
                key={stage.number}
                ref={(el) => { stepRefs.current[index] = el }}
                className={`landing-workflow__step${visible[index] ? ' is-visible' : ''}${isLast ? ' landing-workflow__step--end' : ''}`}
              >
                <span className="landing-workflow__marker" aria-hidden="true">
                  <span className="landing-workflow__marker-dot" />
                </span>

                <div className="landing-workflow__content">
                  <p className="landing-workflow__number">{stage.number}</p>
                  <h3>{stage.title}</h3>
                  <p className="landing-workflow__action">{stage.action}</p>
                  <p className="landing-workflow__rule">{stage.rule}</p>

                  {isActiveWork && (
                    <div className="landing-workflow__branch">
                      <span className="landing-workflow__branch-line" aria-hidden="true" />
                      <span className="landing-workflow__branch-label">
                        Blocked — a temporary branch, not a destination. Work returns to Active work or moves on to Completed.
                      </span>
                    </div>
                  )}

                  {isLast && (
                    <p className="landing-workflow__example">
                      <span className="sr-only">Example history entry: </span>
                      <code>Status · In progress → Blocked · by Jordan Lee · 14:32</code>
                    </p>
                  )}
                </div>

                <div className="landing-workflow__evidence">
                  <StageMedia media={stage.media} />
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
