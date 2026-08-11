/*
 * FE-010 router — route table renders the right page per auth state and role.
 * Covers: / redirect, protected routes, admin gating (/users, /tasks/archived),
 * dynamic params, 403/404, and the ?next= flow.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { screen } from '@testing-library/react'
import { server } from '../src/mocks/server'
import {
  loginAs,
  renderApp,
  ADMIN_EMAIL,
  MEMBER_EMAIL,
  findByHeading,
} from './test-utils'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  loginAs(null)
})
afterAll(() => server.close())

describe('Router', () => {
  it('redirects / to /dashboard for an authenticated admin', async () => {
    loginAs(ADMIN_EMAIL)
    renderApp({ initialPath: '/' })

    expect(await findByHeading('Dashboard')).toBeInTheDocument()
  })

  it('renders each protected page for an admin', async () => {
    loginAs(ADMIN_EMAIL)
    renderApp({ initialPath: '/tasks' })
    expect(await findByHeading('Tasks')).toBeInTheDocument()
  })

  it('renders the task detail route with the task id param', async () => {
    loginAs(ADMIN_EMAIL)
    renderApp({ initialPath: '/tasks/44444444-4444-4444-8444-444444444444' })

    // The detail page renders the fetched task (title from the fixture).
    expect(await findByHeading('Redesign onboarding flow')).toBeInTheDocument()
  })

  it('renders the client detail route with the client id param (h1 = company name)', async () => {
    loginAs(ADMIN_EMAIL)
    renderApp({ initialPath: '/clients/33333333-3333-4333-8333-333333333333' })

    expect(await findByHeading('Bluebird Coffee Co.')).toBeInTheDocument()
  })

  it('renders the new client page for any signed-in user', async () => {
    loginAs(MEMBER_EMAIL)
    renderApp({ initialPath: '/clients/new' })

    expect(await findByHeading('New client')).toBeInTheDocument()
  })

  it('keeps /users out of reach for a member (403, no logout)', async () => {
    loginAs(MEMBER_EMAIL)
    renderApp({ initialPath: '/users' })

    expect(await findByHeading('Access denied')).toBeInTheDocument()
    // Member stays signed in: the app shell nav is still there.
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
  })

  it('keeps /tasks/archived out of reach for a member (403)', async () => {
    loginAs(MEMBER_EMAIL)
    renderApp({ initialPath: '/tasks/archived' })

    expect(await findByHeading('Access denied')).toBeInTheDocument()
  })

  it('renders archived tasks for an admin', async () => {
    loginAs(ADMIN_EMAIL)
    renderApp({ initialPath: '/tasks/archived' })

    expect(await findByHeading('Archived tasks')).toBeInTheDocument()
  })

  it('redirects an unauthenticated user to /login?next=<path>', async () => {
    loginAs(null)
    renderApp({ initialPath: '/clients' })

    await screen.findByRole('heading', { name: 'Sign in' }, { timeout: 3000 })
    expect(window.location.search).toContain('next=%2Fclients')
  })

  it('renders the standalone 403 page when signed out', async () => {
    loginAs(null)
    renderApp({ initialPath: '/403' })

    expect(await findByHeading('Access denied')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
  })

  it('renders the 404 page for unknown paths', async () => {
    loginAs(ADMIN_EMAIL)
    renderApp({ initialPath: '/no-such-page' })

    expect(await findByHeading('Page not found')).toBeInTheDocument()
  })
})
