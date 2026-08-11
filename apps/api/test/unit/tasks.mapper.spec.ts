// Unit tests for the task response mappers (tasks.mapper.ts, TASK-API-001..010 / PH-06).
//
// These mappers are the single place where Prisma Task/TaskChange rows become
// the API contract: FK columns become resolved refs, `dueDate` becomes the
// 'YYYY-MM-DD' date-only string (ADR-003), and TaskChange entries gain their
// derived version (D-5). Pinning the mapping here guards the contract against
// silent shape drift.
import { describe, expect, it } from 'vitest'
import {
  toDateOnly,
  toTaskChange,
  toTaskResponse,
  toTaskSummary,
  type TaskCardRow,
  type TaskWithRefs,
} from '../../src/modules/tasks/tasks.mapper'
import type { ChangeWithActor } from '../../src/modules/tasks/tasks.mapper'

const USER_REF = { id: 'user-1', name: 'Ada Lovelace' }
const CLIENT_REF = { id: 'client-1', companyName: 'Northstar Digital' }

// Fixtures are cast because the Prisma model carries many columns the mapper
// never reads; the tests pin the mapper's read surface, not the full schema.
function card(overrides: Partial<TaskCardRow> = {}): TaskCardRow {
  return {
    id: 'task-1',
    title: 'Ship the onboarding flow',
    status: 'PENDING',
    priority: 'HIGH',
    assignee: USER_REF,
    client: CLIENT_REF,
    dueDate: new Date('2026-08-11T00:00:00.000Z'),
    version: 3,
    updatedAt: new Date('2026-08-10T09:30:00.000Z'),
    labels: [],
    ...overrides,
  } as unknown as TaskCardRow
}

function full(overrides: Partial<TaskWithRefs> = {}): TaskWithRefs {
  return {
    ...card(),
    description: 'A short description',
    blockedReason: null,
    creator: USER_REF,
    archiver: null,
    archivedAt: null,
    createdAt: new Date('2026-08-01T09:00:00.000Z'),
    updatedAt: new Date('2026-08-10T09:30:00.000Z'),
    ...overrides,
  } as unknown as TaskWithRefs
}

describe('toDateOnly', () => {
  it('slices a UTC-midnight date-only value to YYYY-MM-DD (ADR-003)', () => {
    expect(toDateOnly(new Date('2026-08-11T00:00:00.000Z'))).toBe('2026-08-11')
  })

  it('slices the date portion regardless of time-of-day in the Date value', () => {
    expect(toDateOnly(new Date('2026-12-31T23:59:59.999Z'))).toBe('2026-12-31')
  })
})

describe('toTaskSummary', () => {
  it('maps the card row keeping refs and status/priority as-is', () => {
    const summary = toTaskSummary(card())
    expect(summary.id).toBe('task-1')
    expect(summary.title).toBe('Ship the onboarding flow')
    expect(summary.status).toBe('PENDING')
    expect(summary.priority).toBe('HIGH')
    expect(summary.assignee).toEqual(USER_REF)
    expect(summary.client).toEqual(CLIENT_REF)
    expect(summary.version).toBe(3)
    expect(summary.updatedAt).toEqual(new Date('2026-08-10T09:30:00.000Z'))
  })

  it('serializes dueDate to the date-only string (ADR-003)', () => {
    expect(toTaskSummary(card()).dueDate).toBe('2026-08-11')
  })

  it('keeps dueDate null when the task has no deadline', () => {
    expect(toTaskSummary(card({ dueDate: null })).dueDate).toBeNull()
  })

  it('keeps null refs null (unassigned, no client)', () => {
    const summary = toTaskSummary(card({ assignee: null, client: null }))
    expect(summary.assignee).toBeNull()
    expect(summary.client).toBeNull()
  })

  it('flattens the label join rows to the { id, name, color } refs (LAB-002)', () => {
    const summary = toTaskSummary(
      card({
        labels: [
          { label: { id: 'label-1', name: 'bug', color: '#ef4444' } },
          { label: { id: 'label-2', name: 'design', color: '#8b5cf6' } },
        ],
      }),
    )
    expect(summary.labels).toEqual([
      { id: 'label-1', name: 'bug', color: '#ef4444' },
      { id: 'label-2', name: 'design', color: '#8b5cf6' },
    ])
  })

  it('exposes an empty labels array when the task has none', () => {
    expect(toTaskSummary(card()).labels).toEqual([])
  })
})

describe('toTaskResponse', () => {
  it('maps every contract field, resolving creator and archiver refs', () => {
    const archiver = { id: 'admin-1', name: 'Grace Hopper' }
    const archivedAt = new Date('2026-08-12T10:00:00.000Z')
    const response = toTaskResponse(full({ archiver, archivedAt }))

    expect(response.id).toBe('task-1')
    expect(response.title).toBe('Ship the onboarding flow')
    expect(response.description).toBe('A short description')
    expect(response.status).toBe('PENDING')
    expect(response.priority).toBe('HIGH')
    expect(response.assignee).toEqual(USER_REF)
    expect(response.client).toEqual(CLIENT_REF)
    expect(response.dueDate).toBe('2026-08-11')
    expect(response.blockedReason).toBeNull()
    expect(response.creator).toEqual(USER_REF)
    expect(response.archivedBy).toEqual(archiver)
    expect(response.archivedAt).toEqual(archivedAt)
    expect(response.version).toBe(3)
    expect(response.createdAt).toEqual(new Date('2026-08-01T09:00:00.000Z'))
    expect(response.updatedAt).toEqual(new Date('2026-08-10T09:30:00.000Z'))
  })

  it('keeps nullable fields null when the task is active (archivedAt/archivedBy)', () => {
    const response = toTaskResponse(full())
    expect(response.archivedAt).toBeNull()
    expect(response.archivedBy).toBeNull()
  })

  it('keeps description and blockedReason null for null database values', () => {
    const response = toTaskResponse(full({ description: null, blockedReason: null }))
    expect(response.description).toBeNull()
    expect(response.blockedReason).toBeNull()
  })

  it('serializes a non-null blockedReason', () => {
    const response = toTaskResponse(full({ blockedReason: 'Waiting for client approval' }))
    expect(response.blockedReason).toBe('Waiting for client approval')
  })
})

describe('toTaskChange', () => {
  const change = {
    id: 'change-1',
    taskId: 'task-1',
    event: 'PRIORITY_CHANGED',
    field: 'priority',
    oldValue: 'MEDIUM',
    newValue: 'HIGH',
    actor: USER_REF,
    createdAt: new Date('2026-08-09T14:00:00.000Z'),
  } as unknown as ChangeWithActor

  it('derives version = 1-based position in the chronological timeline (D-5)', () => {
    expect(toTaskChange(change, 0).version).toBe(1)
    expect(toTaskChange(change, 4).version).toBe(5)
  })

  it('maps the change fields, actor ref and timestamp as-is', () => {
    const mapped = toTaskChange(change, 1)
    expect(mapped.id).toBe('change-1')
    expect(mapped.taskId).toBe('task-1')
    expect(mapped.event).toBe('PRIORITY_CHANGED')
    expect(mapped.field).toBe('priority')
    expect(mapped.oldValue).toBe('MEDIUM')
    expect(mapped.newValue).toBe('HIGH')
    expect(mapped.actor).toEqual(USER_REF)
    expect(mapped.createdAt).toEqual(new Date('2026-08-09T14:00:00.000Z'))
  })
})
