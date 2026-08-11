/*
 * FE-010 primitives — semantics and a11y contracts of the critical building
 * blocks: Button loading state, Input/Select errors, Badge maps, Alert roles,
 * Drawer (never aria-modal, AP-14) and Dialog (aria-modal + focus trap + Esc).
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Alert } from '../src/components/ui/Alert'
import { Badge, PriorityBadge, StatusBadge, PRIORITY_LABELS, STATUS_LABELS } from '../src/components/ui/Badge'
import { Button } from '../src/components/ui/Button'
import { Dialog } from '../src/components/ui/Dialog'
import { Drawer } from '../src/components/ui/Drawer'
import { Input } from '../src/components/ui/Input'
import { Select } from '../src/components/ui/Select'

describe('Button', () => {
  it('renders with the requested variant and size classes', () => {
    render(<Button variant="danger" size="lg">Delete</Button>)
    const button = screen.getByRole('button', { name: 'Delete' })
    expect(button.className).toContain('btn--danger')
    expect(button.className).toContain('btn--lg')
  })

  it('disables and announces busy while loading', () => {
    render(<Button isLoading>Save</Button>)
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button.querySelector('.animate-spin')).not.toBeNull()
  })

  it('exposes an accessible name for icon-only buttons via aria-label', () => {
    render(<Button aria-label="Close panel">x</Button>)
    expect(screen.getByRole('button', { name: 'Close panel' })).toBeInTheDocument()
  })
})

describe('Input', () => {
  it('shows its label and wires aria-invalid + describedby on error', () => {
    render(<Input label="Email" error="Enter a valid email." value="" onChange={() => {}} />)
    const input = screen.getByLabelText(/Email/i)
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('aria-describedby')
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email.')
  })

  it('marks required fields (decorative asterisk is aria-hidden)', () => {
    const { container } = render(<Input label="Title" required value="" onChange={() => {}} />)
    const input = screen.getByLabelText(/Title/i)
    expect(input).toBeRequired()
    expect(container.querySelector('.field__required')).not.toBeNull()
  })
})

describe('Select', () => {
  it('renders options and a disabled placeholder', () => {
    render(
      <Select
        label="Priority"
        placeholder="Choose…"
        options={[
          { value: 'HIGH', label: 'High' },
          { value: 'LOW', label: 'Low' },
        ]}
      />,
    )
    const select = screen.getByLabelText(/Priority/i)
    expect(screen.getByRole('option', { name: 'Choose…' })).toBeDisabled()
    expect(screen.getByRole('option', { name: 'High' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Low' })).toBeInTheDocument()
    expect(select).toBeInTheDocument()
  })
})

describe('Badge', () => {
  it('maps priorities and statuses to labels and variants', () => {
    expect(PRIORITY_LABELS).toMatchObject({ HIGH: 'High', URGENT: 'Urgent' })
    expect(STATUS_LABELS).toMatchObject({ BLOCKED: 'Blocked', IN_PROGRESS: 'In progress' })
    render(<PriorityBadge priority="HIGH" />)
    expect(screen.getByText('High')).toHaveClass('badge--warning')
  })

  it('supports all variants', () => {
    render(
      <>
        <Badge variant="success">Done</Badge>
        <Badge variant="error">Blocked</Badge>
        <Badge variant="neutral">Low</Badge>
      </>,
    )
    expect(screen.getByText('Done')).toHaveClass('badge--success')
    expect(screen.getByText('Blocked')).toHaveClass('badge--error')
    expect(screen.getByText('Low')).toHaveClass('badge--neutral')
  })
})

describe('Alert', () => {
  it('uses role=alert for errors and role=status for info', () => {
    render(
      <>
        <Alert variant="error" title="Failed" />
        <Alert variant="info" title="Saved" />
      </>,
    )
    expect(screen.getByText('Failed').closest('[role]')).toHaveAttribute('role', 'alert')
    expect(screen.getByText('Saved').closest('[role]')).toHaveAttribute('role', 'status')
  })
})

describe('Drawer (non-modal)', () => {
  it('renders a panel without aria-modal and closes on Escape', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [open, setOpen] = useState(true)
      return (
        <Drawer open={open} onClose={() => setOpen(false)} title="Task panel">
          Content
        </Drawer>
      )
    }
    render(<Harness />)

    const panel = screen.getByRole('complementary', { name: 'Task panel' })
    expect(panel).not.toHaveAttribute('aria-modal')
    // Non-modal: no role=dialog anywhere (AP-14).
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })
})

describe('Dialog (modal)', () => {
  function Harness({ initialOpen = true }: { initialOpen?: boolean }) {
    const [open, setOpen] = useState(initialOpen)
    return (
      <Dialog open={open} onClose={() => setOpen(false)} title="New task">
        <p>Create a task</p>
      </Dialog>
    )
  }

  it('renders aria-modal dialog with a labelled heading', () => {
    render(<Harness />)
    const dialog = screen.getByRole('dialog', { name: 'New task' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('button', { name: 'Close New task' })).toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('moves focus inside on open', () => {
    render(<Harness />)
    expect(screen.getByRole('button', { name: 'Close New task' })).toHaveFocus()
  })

  it('returns focus to the trigger on close', async () => {
    const user = userEvent.setup()
    function TriggerHarness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <Button onClick={() => setOpen(true)}>Open dialog</Button>
          <Dialog open={open} onClose={() => setOpen(false)} title="New task">
            <p>Body</p>
          </Dialog>
        </>
      )
    }
    render(<TriggerHarness />)
    const trigger = screen.getByRole('button', { name: 'Open dialog' })
    await user.click(trigger)
    await user.keyboard('{Escape}')
    expect(trigger).toHaveFocus()
  })
})
