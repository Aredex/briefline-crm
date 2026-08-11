/*
 * Skeleton — loading placeholder with pulse animation. Animation is disabled
 * under prefers-reduced-motion (global.css).
 */
import type { HTMLAttributes } from 'react'

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Defaults: full width, 1em height. Override via className. */
  as?: 'div' | 'span'
}

export function Skeleton({ as: Tag = 'div', className, ...rest }: SkeletonProps) {
  return <Tag className={`skeleton ${className ?? ''}`} aria-hidden="true" {...rest} />
}
