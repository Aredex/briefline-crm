/*
 * Skeleton — loading placeholder with shimmer animation. Animation is disabled
 * under prefers-reduced-motion (global.css). Migrated to Tailwind CSS.
 */
import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  as?: 'div' | 'span'
}

export function Skeleton({ as: Tag = 'div', className, ...rest }: SkeletonProps) {
  return (
    <Tag
      className={cn('h-4 w-full rounded-sm bg-[var(--color-gray-200)] animate-[skeleton-shimmer_1.8s_ease-in-out_infinite]', className)}
      aria-hidden="true"
      {...rest}
    />
  )
}
