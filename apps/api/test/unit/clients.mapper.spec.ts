// Unit tests for the client response mappers (clients.mapper.ts, CLI-API-001..005 / PH-05).
//
// The single place where the Prisma Client row is shaped into the API contract:
// `createdById` becomes the resolved `createdBy` user ref and no internal
// columns leak into responses.
import { describe, expect, it } from 'vitest'
import {
  toClientResponse,
  toTaskSummary,
  type ClientWithCreator,
} from '../../src/modules/clients/clients.mapper'

const CREATOR = { id: 'user-1', name: 'Ada Lovelace' }

function client(overrides: Partial<ClientWithCreator> = {}): ClientWithCreator {
  return {
    id: 'client-1',
    companyName: 'Northstar Digital',
    industry: 'Software',
    contactName: 'Jane Doe',
    contactEmail: 'jane@northstar.digital',
    phone: '+34 600 000 000',
    notes: 'Key account',
    status: 'ACTIVE',
    creator: CREATOR,
    createdAt: new Date('2026-07-01T09:00:00.000Z'),
    updatedAt: new Date('2026-07-10T09:00:00.000Z'),
    ...overrides,
  } as unknown as ClientWithCreator
}

describe('toClientResponse', () => {
  it('maps every contract field, resolving the creator ref', () => {
    const response = toClientResponse(client())
    expect(response.id).toBe('client-1')
    expect(response.companyName).toBe('Northstar Digital')
    expect(response.industry).toBe('Software')
    expect(response.contactName).toBe('Jane Doe')
    expect(response.contactEmail).toBe('jane@northstar.digital')
    expect(response.phone).toBe('+34 600 000 000')
    expect(response.notes).toBe('Key account')
    expect(response.status).toBe('ACTIVE')
    expect(response.createdBy).toEqual(CREATOR)
    expect(response.createdAt).toEqual(new Date('2026-07-01T09:00:00.000Z'))
    expect(response.updatedAt).toEqual(new Date('2026-07-10T09:00:00.000Z'))
  })

  it('keeps nullable contact fields null when the database says null', () => {
    const response = toClientResponse(client({ industry: null, phone: null, notes: null }))
    expect(response.industry).toBeNull()
    expect(response.phone).toBeNull()
    expect(response.notes).toBeNull()
  })

  it('never leaks the internal createdById FK column', () => {
    const response = toClientResponse(client())
    expect(response).not.toHaveProperty('createdById')
  })
})

describe('toTaskSummary (related-task card, FR-CLI-005)', () => {
  const task = {
    id: 'task-1',
    title: 'Ship the onboarding flow',
    status: 'PENDING',
    priority: 'HIGH',
    assignee: { id: 'user-2', name: 'Grace Hopper' },
    client: { id: 'client-1', companyName: 'Northstar Digital' },
    dueDate: new Date('2026-08-11T00:00:00.000Z'),
    version: 2,
    updatedAt: new Date('2026-08-09T14:00:00.000Z'),
    labels: [], // join rows; flattened to { id, name, color } by the mapper (LAB-002)
  }

  it('maps the compact card shape with refs and meta', () => {
    const summary = toTaskSummary(task)
    expect(summary.id).toBe('task-1')
    expect(summary.title).toBe('Ship the onboarding flow')
    expect(summary.status).toBe('PENDING')
    expect(summary.priority).toBe('HIGH')
    expect(summary.assignee).toEqual({ id: 'user-2', name: 'Grace Hopper' })
    expect(summary.client).toEqual({ id: 'client-1', companyName: 'Northstar Digital' })
    expect(summary.version).toBe(2)
    expect(summary.updatedAt).toEqual(new Date('2026-08-09T14:00:00.000Z'))
  })

  it('keeps dueDate and refs null when the source is null', () => {
    const summary = toTaskSummary({ ...task, dueDate: null, assignee: null, client: null })
    expect(summary.dueDate).toBeNull()
    expect(summary.assignee).toBeNull()
    expect(summary.client).toBeNull()
  })

  it('passes the dueDate through unchanged (Date)', () => {
    expect(toTaskSummary(task).dueDate).toEqual(new Date('2026-08-11T00:00:00.000Z'))
  })

  it('flattens the label join rows to { id, name, color } refs (LAB-002)', () => {
    const summary = toTaskSummary({
      ...task,
      labels: [{ label: { id: 'label-1', name: 'bug', color: '#ef4444' } }],
    })
    expect(summary.labels).toEqual([{ id: 'label-1', name: 'bug', color: '#ef4444' }])
  })
})
