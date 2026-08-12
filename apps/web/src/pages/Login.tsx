/*
 * Login — public page. CSRF token is fetched by the API client automatically;
 * errors surface per the contract: 401 invalid credentials (generic message,
 * no field targeting), 429 rate limit with countdown, 5xx server problem.
 * Demo accounts come from the wireframes §2.1.
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ApiError } from '../api/client'
import { useAuth } from '../providers/AuthProvider'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Form } from '../components/forms/Form'
import { FormField } from '../components/forms/FormField'
import { IconLock, IconShield } from '../components/ui/icons'

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter your email address.')
    .email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
})

type LoginValues = z.infer<typeof loginSchema>

type LoginError =
  | { kind: 'invalid' }
  | { kind: 'rate-limited'; retryAfterSeconds: number }
  | { kind: 'server' }

const DEMO_ACCOUNTS = import.meta.env.PROD
  ? []
  : [
      { label: 'Admin (Alex Rivera)', email: 'admin@briefline.demo', password: 'briefline-demo-2026' },
      { label: 'Member (Marco Díaz)', email: 'member@briefline.demo', password: 'briefline-demo-2026' },
    ]

export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [error, setError] = useState<LoginError | null>(null)
  const [countdown, setCountdown] = useState(0)
  const alertRef = useRef<HTMLDivElement>(null)
  const submitButtonRef = useRef<HTMLButtonElement>(null)

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  // Rate-limit countdown.
  useEffect(() => {
    if (countdown <= 0) return
    const timer = setInterval(() => setCountdown((seconds) => Math.max(0, seconds - 1)), 1000)
    return () => clearInterval(timer)
  }, [countdown])

  useEffect(() => {
    if (error) alertRef.current?.focus()
  }, [error])

  const submit = async (values: LoginValues) => {
    setError(null)
    try {
      await login(values.email, values.password)
      const next = searchParams.get('next')
      navigate(next && next.startsWith('/') ? next : '/dashboard', { replace: true })
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.status === 401) setError({ kind: 'invalid' })
        else if (caught.status === 429) {
          const seconds = caught.retryAfterSeconds ?? 60
          setError({ kind: 'rate-limited', retryAfterSeconds: seconds })
          setCountdown(seconds)
        } else setError({ kind: 'server' })
      } else {
        setError({ kind: 'server' })
      }
    }
  }

  const fillDemo = (email: string, password: string) => {
    form.setValue('email', email, { shouldValidate: false })
    form.setValue('password', password, { shouldValidate: false })
    // Wireframe §2.1: picking a demo account fills the form and moves focus to
    // Sign in, so one Enter finishes the flow.
    submitButtonRef.current?.focus()
  }

  const isRateLimited = error?.kind === 'rate-limited' && countdown > 0

  return (
    <main className="login-page" id="main" tabIndex={-1}>
      <div className="login-page__card">
        <div className="login-page__brand">
          <span className="login-page__logo" aria-hidden="true">
            <IconShield />
          </span>
          <span>Briefline</span>
        </div>
        <h1 className="login-page__title">Sign in</h1>
        <p className="login-page__subtitle">Access your client work and task board.</p>

        <div
          ref={alertRef}
          tabIndex={-1}
          style={{ outline: 'none' }}
        >
          {error?.kind === 'invalid' && (
            <Alert variant="error" title="Sign in failed">
              The email or password is incorrect. Please try again.
            </Alert>
          )}
          {error?.kind === 'rate-limited' && (
            <Alert variant="warning" title="Too many attempts">
              Please wait {countdown} {countdown === 1 ? 'second' : 'seconds'} before trying again.
            </Alert>
          )}
          {error?.kind === 'server' && (
            <Alert variant="error" title="We could not reach the server">
              Please check your connection and try again. Your session is safe.
            </Alert>
          )}
        </div>

        <Form form={form} onSubmit={submit} aria-label="Sign in form">
          <FormField form={form} name="email" label="Email address" required>
            {(field) => (
              <Input
                {...field}
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="you@company.com"
                autoFocus
              />
            )}
          </FormField>

          <FormField form={form} name="password" label="Password" required>
            {(field) => (
              <Input
                {...field}
                type="password"
                autoComplete="current-password"
                placeholder="••••••••••"
              />
            )}
          </FormField>

          <Button
            ref={submitButtonRef}
            type="submit"
            size="lg"
            className="login-page__submit"
            leftIcon={<IconLock />}
            isLoading={form.formState.isSubmitting}
            disabled={isRateLimited}
          >
            {form.formState.isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </Form>

        <div className="login-page__demo">
          <p className="login-page__demo-title">Demo accounts</p>
          <ul className="login-page__demo-list">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email}>
                <button
                  type="button"
                  className="login-page__demo-button"
                  onClick={() => fillDemo(account.email, account.password)}
                >
                  <span>{account.label}</span>
                  <span className="login-page__demo-email">{account.email}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  )
}
