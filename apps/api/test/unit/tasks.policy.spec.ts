// Unit tests for the central task object policy (tasks.policy.ts, TASK-API-001 / PH-06).
//
// The three predicates are the ONLY authorization surface for tasks (every
// read/write path in TasksService routes through them). They encode
// permission-matrix.md §4 rows 19-31:
//   - canViewTask: active → any authenticated user; archived → ADMIN only
//     (members get a 404-equivalent false, BOLA-safe BR-016);
//   - canEditTask: archived → no one; ADMIN → any; MEMBER → creator/assignee
//     only (BR-013/014), never a hint about existence;
//   - canArchiveTask: ADMIN only, and never twice (BR-015).
//
// NOTE: the PH-11 request named canAccess/canMutate/canChangeStatus; the actual
// surface shipped in PH-06 is canViewTask/canEditTask/canArchiveTask — these
// tests pin the real API.
import { describe, expect, it } from 'vitest'
import {
  canArchiveTask,
  canEditTask,
  canViewTask,
  type ActorLike,
  type TaskRowLike,
} from '../../src/modules/tasks/tasks.policy'

const ADMIN: ActorLike = { id: 'admin-1', role: 'ADMIN' }
const MEMBER: ActorLike = { id: 'member-1', role: 'MEMBER' }
const OTHER_MEMBER: ActorLike = { id: 'member-2', role: 'MEMBER' }

function task(overrides: Partial<TaskRowLike> = {}): TaskRowLike {
  return {
    archivedAt: null,
    creatorId: MEMBER.id,
    assigneeId: null,
    ...overrides,
  }
}

describe('canViewTask', () => {
  it('allows every authenticated user to view an active task', () => {
    expect(canViewTask(ADMIN, task())).toBe(true)
    expect(canViewTask(MEMBER, task())).toBe(true)
  })

  it('allows an admin to view an archived task', () => {
    expect(canViewTask(ADMIN, task({ archivedAt: new Date('2026-07-01T10:00:00Z') }))).toBe(true)
  })

  it('denies a member a view of an archived task (BOLA-safe 404-equivalent)', () => {
    expect(canViewTask(MEMBER, task({ archivedAt: new Date('2026-07-01T10:00:00Z') }))).toBe(false)
  })

  it('does not leak role data to the caller — the boolean only depends on archival', () => {
    // Even a member who created/owns the archived task cannot see it.
    expect(
      canViewTask(MEMBER, task({ archivedAt: new Date(), creatorId: MEMBER.id, assigneeId: MEMBER.id })),
    ).toBe(false)
  })
})

describe('canEditTask', () => {
  it('denies edits to archived tasks for everyone, including the admin (409/404 territory)', () => {
    expect(canEditTask(ADMIN, task({ archivedAt: new Date() }))).toBe(false)
    expect(canEditTask(MEMBER, task({ archivedAt: new Date() }))).toBe(false)
  })

  it('allows an admin to edit any active task (BR-014)', () => {
    expect(canEditTask(ADMIN, task())).toBe(true)
  })

  it('allows the member who created the task to edit it (BR-013)', () => {
    expect(canEditTask(MEMBER, task({ creatorId: MEMBER.id }))).toBe(true)
  })

  it('allows the assigned member to edit the task even if not the creator', () => {
    expect(canEditTask(MEMBER, task({ creatorId: OTHER_MEMBER.id, assigneeId: MEMBER.id }))).toBe(true)
  })

  it('denies a member who neither created nor is assigned the task (403, no existence hint)', () => {
    expect(canEditTask(MEMBER, task({ creatorId: OTHER_MEMBER.id, assigneeId: null }))).toBe(false)
  })

  it('denies a member when the assignee is someone else', () => {
    expect(canEditTask(MEMBER, task({ creatorId: OTHER_MEMBER.id, assigneeId: OTHER_MEMBER.id }))).toBe(
      false,
    )
  })

  it('denies editing when assigneeId is null and the actor is not the creator', () => {
    expect(canEditTask(MEMBER, task({ creatorId: OTHER_MEMBER.id }))).toBe(false)
  })
})

describe('canArchiveTask', () => {
  it('allows an admin to archive an active task (BR-015)', () => {
    expect(canArchiveTask(ADMIN, task())).toBe(true)
  })

  it('denies a double archive — already-archived tasks are a 409 no-op', () => {
    expect(canArchiveTask(ADMIN, task({ archivedAt: new Date() }))).toBe(false)
  })

  it('denies members entirely, even the creator or assignee', () => {
    expect(canArchiveTask(MEMBER, task({ creatorId: MEMBER.id, assigneeId: MEMBER.id }))).toBe(false)
  })
})
