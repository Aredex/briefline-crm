/*
 * Button — variants primary/secondary/danger/ghost, sizes sm/md/lg.
 * A11y: loading disables the control (aria-busy + spinner), icon-only buttons
 * require aria-label, touch targets >= 44px on md/lg (AC-05).
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { IconSpinner } from './icons'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  isLoading?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'btn btn--primary',
  secondary: 'btn btn--secondary',
  danger: 'btn btn--danger',
  ghost: 'btn btn--ghost',
}

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'btn--sm',
  md: 'btn--md',
  lg: 'btn--lg',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', isLoading = false, leftIcon, rightIcon, className, disabled, children, type = 'button', ...rest },
  ref,
) {
  const classes = [VARIANT_CLASS[variant], SIZE_CLASS[size], isLoading ? 'is-loading' : '', className ?? '']
    .filter(Boolean)
    .join(' ')

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
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
