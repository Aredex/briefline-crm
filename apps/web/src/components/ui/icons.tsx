/*
 * Minimal inline icon set — 20px stroke, currentColor. All icons are
 * aria-hidden; decorative by design (labels come from text or aria-label).
 * No icon library dependency (none is in the verified matrix).
 */
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function base(props: IconProps) {
  return {
    width: 20,
    height: 20,
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
    ...props,
  }
}

export function IconSpinner(props: IconProps) {
  return (
    <svg {...base(props)} className={`animate-spin ${props.className ?? ''}`}>
      <path d="M10 2a8 8 0 1 0 8 8" />
    </svg>
  )
}

export function IconAlertTriangle(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10 3.5 18.5 17h-17L10 3.5Z" />
      <path d="M10 8.5v4" />
      <path d="M10 15.5h.01" />
    </svg>
  )
}

export function IconCheckCircle(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="10" cy="10" r="7.5" />
      <path d="m6.5 10 2.5 2.5 4.5-5" />
    </svg>
  )
}

export function IconInfo(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 9v4.5" />
      <path d="M10 6.5h.01" />
    </svg>
  )
}

export function IconX(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m5 5 10 10M15 5 5 15" />
    </svg>
  )
}

export function IconMenu(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 5.5h14M3 10h14M3 14.5h14" />
    </svg>
  )
}

export function IconChevronDown(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m5 7.5 5 5 5-5" />
    </svg>
  )
}

export function IconChevronRight(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m7.5 5 5 5-5 5" />
    </svg>
  )
}

export function IconUser(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="10" cy="6.5" r="3" />
      <path d="M3.5 17a6.5 6.5 0 0 1 13 0" />
    </svg>
  )
}

export function IconInbox(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3.5 10.5 6 4h8l2.5 6.5" />
      <path d="M3.5 10.5h4l1.5 2.5h2l1.5-2.5h4" />
      <path d="M3.5 10.5v5h13v-5" />
    </svg>
  )
}

export function IconSearch(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="8.5" cy="8.5" r="5" />
      <path d="m12.5 12.5 4 4" />
    </svg>
  )
}

export function IconCalendar(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="4.5" width="14" height="12.5" rx="1.5" />
      <path d="M3 8.5h14M7 2.5v3.5M13 2.5v3.5" />
    </svg>
  )
}

export function IconLock(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="9" width="12" height="8" rx="1.5" />
      <path d="M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9" />
    </svg>
  )
}

export function IconShield(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10 2.5 16.5 5v5c0 4-2.8 6.8-6.5 7.5C6.3 16.8 3.5 14 3.5 10V5L10 2.5Z" />
      <path d="M10 6.5v4" />
      <path d="M10 13.5h.01" />
    </svg>
  )
}

export function IconArrowLeft(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M17 10H3.5M9 4.5 3.5 10 9 15.5" />
    </svg>
  )
}

export function IconLogOut(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 3.5H4.5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1H9" />
      <path d="M12.5 6.5 16 10l-3.5 3.5M16 10H7" />
    </svg>
  )
}

export function IconPlus(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10 4v12M4 10h12" />
    </svg>
  )
}

export function IconArchive(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 5.5h14v11H3v-11Z" />
      <path d="M2 3.5h16v2H2v-2Z" />
      <path d="M8 9h4" />
    </svg>
  )
}

export function IconClock(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 6v4.2l2.8 1.8" />
    </svg>
  )
}

export function IconHistory(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3.5 10a6.5 6.5 0 1 0 1.9-4.6L3.5 7.4" />
      <path d="M3.5 3.5v4h4" />
      <path d="M10 6.5V10l2.5 1.5" />
    </svg>
  )
}

export function IconEdit(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M13.5 4 16 6.5 7.5 15H5v-2.5L13.5 4Z" />
      <path d="M11.5 6 14 8.5" />
    </svg>
  )
}

/** Sort indicators (PC-02 task list table headers). Decorative by design. */
export function IconArrowUp(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10 16V4.5M5.5 9 10 4.5 14.5 9" />
    </svg>
  )
}

export function IconArrowDown(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10 4v11.5M5.5 11 10 15.5 14.5 11" />
    </svg>
  )
}

/** Drag handle (grip) — the ONLY pointer affordance of the sortable card. */
export function IconGripVertical(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="7.5" cy="5" r="1" />
      <circle cx="12.5" cy="5" r="1" />
      <circle cx="7.5" cy="10" r="1" />
      <circle cx="12.5" cy="10" r="1" />
      <circle cx="7.5" cy="15" r="1" />
      <circle cx="12.5" cy="15" r="1" />
    </svg>
  )
}
