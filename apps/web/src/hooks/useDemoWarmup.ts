/*
 * Demo warm-up — FUN-003 (cold start), plan decision A8. Client-only ping
 * against the public `/api/v1/health` endpoint (@Public(), no DB touch — see
 * apps/api/src/modules/health/health.controller.ts). The free hosting tier
 * spins the API down after idle time; a cold start takes ~30-60s. This hook
 * never authenticates and never blocks navigation — the demo links stay
 * clickable at every state (§15). It only gives the visitor an honest reason
 * for the wait instead of silence.
 *
 * States:
 *  - idle: no check started yet (nobody pressed a demo link this session).
 *  - waking: first ping failed/timed out and a retry is in flight — the
 *    service is presumed to be cold-starting.
 *  - ready: the health check answered inside the timeout.
 *  - failed: every retry inside the ~60s window was exhausted.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

const HEALTH_URL = '/api/v1/health'
const REQUEST_TIMEOUT_MS = 4000
const MAX_ATTEMPTS = 3
// Backoff between attempts (ms). Total window: 4s (attempt) + 5s wait +
// 4s (attempt) + 15s wait + 4s (attempt) ≈ 32s of active checking, well
// inside the ~60s a Render cold start can take, without hammering the API.
const RETRY_DELAYS_MS = [5000, 15000]

export type DemoWarmupStatus = 'idle' | 'waking' | 'ready' | 'failed'

export interface UseDemoWarmupResult {
  status: DemoWarmupStatus
  /** Pings /api/v1/health with limited retries. Safe to call more than once. */
  check: () => Promise<void>
}

async function pingHealth(): Promise<boolean> {
  try {
    const response = await fetch(HEALTH_URL, {
      method: 'GET',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    return response.ok
  } catch {
    return false
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Warm-up prober for the demo API. Call `check()` when a visitor picks a demo
 * link; it never prevents the link from navigating — it only drives the
 * status a caller can render alongside it (e.g. "The demo is waking up...").
 */
export function useDemoWarmup(): UseDemoWarmupResult {
  const [status, setStatus] = useState<DemoWarmupStatus>('idle')
  // Guards against overlapping calls if the visitor clicks more than once.
  const inFlight = useRef(false)
  // QA F5 (#2): without this, a caller that unmounts mid-retry (navigating
  // away again before the ~32s window closes) leaves setState calls firing
  // on a dead component and the retry loop's sleep()s running for nothing.
  const cancelled = useRef(false)
  useEffect(() => () => { cancelled.current = true }, [])

  const check = useCallback(async () => {
    if (inFlight.current || cancelled.current) return
    inFlight.current = true
    try {
      const firstAttemptOk = await pingHealth()
      if (cancelled.current) return
      if (firstAttemptOk) {
        setStatus('ready')
        return
      }

      setStatus('waking')
      for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt += 1) {
        const delay = RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1] ?? 5000
        await sleep(delay)
        if (cancelled.current) return
        const ok = await pingHealth()
        if (cancelled.current) return
        if (ok) {
          setStatus('ready')
          return
        }
      }

      if (!cancelled.current) setStatus('failed')
    } finally {
      inFlight.current = false
    }
  }, [])

  return { status, check }
}
