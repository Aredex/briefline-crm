/*
 * Button — variants primary/secondary/danger/ghost, sizes sm/md/lg.
 * Migrated to Tailwind CSS + CVA (shadcn/ui pattern). Same public API.
 * A11y: loading disables the control (aria-busy + spinner), icon-only buttons
 * require aria-label, touch targets >= 44px on md/lg (AC-05).
 */
import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { IconSpinner } from './icons'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)] disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        primary: 'bg-[var(--color-primary-600)] text-white hover:bg-[var(--color-primary-700)]',
        secondary: 'bg-white text-[var(--color-gray-700)] border border-[var(--color-gray-200)] hover:bg-[var(--color-surface)]',
        danger: 'bg-[var(--color-error-700)] text-white hover:bg-red-800',
        ghost: 'text-[var(--color-gray-600)] hover:bg-[var(--color-gray-100)] hover:text-[var(--color-gray-900)]',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-[44px] px-4 text-sm',
        lg: 'h-12 px-6 text-base',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, isLoading = false, leftIcon, rightIcon, className, disabled, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...rest}
    >
      {isLoading ? (
        <IconSpinner />
      ) : (
        leftIcon && <span className="btn__icon" aria-hidden="true">{leftIcon}</span>
      )}
      {children && <span className="btn__label">{children}</span>}
      {!isLoading && rightIcon && (
        <span className="btn__icon" aria-hidden="true">{rightIcon}</span>
      )}
    </button>
  )
})
