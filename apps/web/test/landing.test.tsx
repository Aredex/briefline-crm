/*
 * F0/T0.4 landing baseline — public landing page (/) renders all 9 sections
 * with the correct DOM shape (headings, tabs, permissions table, footer
 * landmark) after the T0.3 extraction into per-section components. Guards
 * against visual regressions in the upcoming F1+ passes.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { screen } from '@testing-library/react'
import { server } from '../src/mocks/server'
import { loginAs, renderApp, findByHeading } from './test-utils'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  loginAs(null)
})
afterAll(() => server.close())

describe('Landing', () => {
  it('renders the hero and all 9 sections', async () => {
    loginAs(null)
    renderApp({ initialPath: '/' })

    expect(await findByHeading('Client work, clearly owned.')).toBeInTheDocument()
    expect(await findByHeading('When client work lives everywhere')).toBeInTheDocument()
    expect(await findByHeading('From client brief to accountable delivery')).toBeInTheDocument()
    expect(await findByHeading('Explore the product')).toBeInTheDocument()
    expect(await findByHeading('Permissions that mean something')).toBeInTheDocument()
    expect(await findByHeading('Engineering')).toBeInTheDocument()
    expect(await findByHeading('Quality and accessibility')).toBeInTheDocument()
    expect(await findByHeading('About this case study')).toBeInTheDocument()
    expect(
      await findByHeading('See how Briefline turns client context into accountable work.'),
    ).toBeInTheDocument()
  })

  it('renders the product explorer tabs with correct roles and initial selection', async () => {
    loginAs(null)
    renderApp({ initialPath: '/' })

    await findByHeading('Explore the product')

    const tablist = screen.getByRole('tablist', { name: 'Product previews' })
    expect(tablist).toBeInTheDocument()

    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(3)
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false')
    expect(tabs[2]).toHaveAttribute('aria-selected', 'false')
  })

  it('renders the permissions table with a caption and scoped column headers', async () => {
    loginAs(null)
    renderApp({ initialPath: '/' })

    await findByHeading('Permissions that mean something')

    expect(
      screen.getByText('Capability matrix for Administrator and Member roles'),
    ).toBeInTheDocument()

    const columnHeaders = screen.getAllByRole('columnheader')
    expect(columnHeaders).toHaveLength(3)
    columnHeaders.forEach((header) => {
      expect(header).toHaveAttribute('scope', 'col')
    })
  })

  it('renders a single footer landmark', async () => {
    loginAs(null)
    renderApp({ initialPath: '/' })

    await findByHeading('Client work, clearly owned.')

    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
  })
})
