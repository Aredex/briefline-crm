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
import { useDemoWarmup } from '../hooks/useDemoWarmup'
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

// Public demo credentials (README, landing CTA). This app has no real user
// accounts to protect — the whole product is a fictional, daily-reset demo —
// so the quick-fill list stays available in production too; hiding it there
// would silently break the landing's "Open administrator/member demo" links
// (FUN-002, plan T5.2).
const DEMO_ACCOUNTS = [
  {
    role: 'admin' as const,
    label: 'Admin (Alex Rivera)',
    email: 'admin@briefline.demo',
    password: 'briefline-demo-2026',
    description: 'Full workspace: manage clients, contacts, users, and permissions.',
  },
  {
    role: 'member' as const,
    label: 'Member (Marco Díaz)',
    email: 'member@briefline.demo',
    password: 'briefline-demo-2026',
    description: 'Ownership-based access: work the board, but only edit tasks you created.',
  },
]

export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [error, setError] = useState<LoginError | null>(null)
  const [countdown, setCountdown] = useState(0)
  const [prefilledRole, setPrefilledRole] = useState<'admin' | 'member' | null>(null)
  const { status: warmupStatus, check: checkWarmup } = useDemoWarmup()
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

  // QA F5 (#1): this used to live in Hero/FinalCta, triggered by the demo
  // CTA's onClick — but that click navigates to /login in the same tick,
  // unmounting the landing before the first ping could ever resolve, so the
  // "waking up" status never rendered anywhere. Login is where the visitor
  // actually lands and waits, and it stays mounted for the whole check —
  // check unconditionally on mount, not just for ?demo= arrivals, since an
  // organic /login visit hits the same possibly-sleeping API.
  useEffect(() => {
    void checkWarmup()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount.
  }, [])

  const submit = async (values: LoginValues) => {
    setError(null)
    try {
      await login(values.email, values.password)
      const next = searchParams.get('next')
      // QA F5: `startsWith('/')` alone accepts `//host/...` and `/\host/...`,
      // the two classic same-prefix redirect bypasses. Today's router version
      // happens to normalize both back to same-origin, but that's the
      // router's behavior, not this guard's — require a single leading slash
      // explicitly so a future router bump can't silently reopen it.
      const isSafeNext = next != null && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')
      navigate(isSafeNext ? next : '/dashboard', { replace: true })
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

  const fillDemo = (email: string, password: string, moveFocus: boolean) => {
    form.setValue('email', email, { shouldValidate: false })
    form.setValue('password', password, { shouldValidate: false })
    // Wireframe §2.1: picking a demo account fills the form and moves focus to
    // Sign in, so one Enter finishes the flow. Only for a manual click, though
    // — see the mount effect below for why the URL-driven prefill skips this.
    if (moveFocus) submitButtonRef.current?.focus()
  }

  // FUN-002 / plan T5.2: /login?demo=admin|member (from the landing CTA)
  // preselects the matching demo account. It only fills the form — it never
  // submits on its own, the visitor still has to confirm explicitly.
  //
  // QA F5: does NOT move focus to Sign in like the manual demo-account
  // buttons do. autoFocus already puts focus on the email field on mount;
  // moving it to the submit button here would race that (this effect commits
  // after autoFocus), landing an arriving screen-reader user on a submit
  // button with no announced context, one stray Enter away from signing in
  // with no idea why. The email field's already-focused, already-filled
  // state is a safe, discoverable landing spot instead.
  useEffect(() => {
    const demo = searchParams.get('demo')
    if (demo !== 'admin' && demo !== 'member') return
    const account = DEMO_ACCOUNTS.find((candidate) => candidate.role === demo)
    if (account) {
      fillDemo(account.email, account.password, false)
      setPrefilledRole(account.role)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount, driven by the URL only.
  }, [])

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

        {prefilledRole && (
          <p role="status" className="login-page__demo-prefilled">
            {prefilledRole === 'admin' ? 'Administrator' : 'Member'} demo credentials filled in — review and sign in below.
          </p>
        )}

        {/* FUN-003 cold start — see the useEffect above for why this lives
            here and not on the landing CTA that linked here. */}
        {warmupStatus === 'waking' && (
          <p role="status" className="login-page__warmup">
            The demo is waking up. This can take up to 60 seconds on the free hosting tier.
          </p>
        )}
        {warmupStatus === 'failed' && (
          <p role="status" className="login-page__warmup">
            The demo is taking longer than usual to wake up. Signing in still works — it may just
            take a little longer on the first try.
          </p>
        )}

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
                  onClick={() => fillDemo(account.email, account.password, true)}
                >
                  <span>{account.label}</span>
                  <span className="login-page__demo-email">{account.email}</span>
                </button>
                {/* FUN-002: the copy explains what each role can test. */}
                <p className="login-page__demo-description">{account.description}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  )
}
