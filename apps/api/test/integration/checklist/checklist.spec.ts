// CHECK-001/002 integration (PC-05) — per-task checklist.
//
// Reads follow the task visibility rule (canViewTask): a checklist is only
// reachable when the task itself is visible — archived tasks are 404 for
// members (identical to an unknown id, BOLA-safe). Mutations follow the task
// edit policy (canEditTask): archived tasks are 404 for members and 409
// TASK_ARCHIVED for admins; unrelated members get 403. Toggle/content updates
// carry expectedVersion (required) and commit via CAS — a mismatch is 409
// STALE_VERSION with the current safe state. Reorder applies the full
// ordering atomically; an id from another task is a 404.
//
// Throttle budget: TWO logins in beforeAll (shared admin1 + member1 sessions —
// beforeEach only reseeds the DB, and the reseed recreates the same ids so the
// JWTs stay valid). The 5/min auth budget is never approached.
import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestApp } from '../helpers/test-app'
import { USERS, dockerAvailable, seedBaseUsers, startTestDb, truncateAll, type TestDb } from '../helpers/fixtures'
import { loginAs, newAgent, type AuthSession } from '../helpers/auth-flow'

const TASK_A_ID = 'cccccccc-cccc-4000-8000-000000000101' // ACTIVE, created by member1 (editable)
const TASK_B_ID = 'cccccccc-cccc-4000-8000-000000000102' // ACTIVE, created by admin1 (member-unrelated)
const TASK_ARCHIVED_ID = 'cccccccc-cccc-4000-8000-000000000103' // ARCHIVED (admin only)

const itemUuid = (n: number): string => `eeeeeeee-eeee-4000-8000-${String(n).padStart(12, '0')}`

describe.skipIf(!dockerAvailable())('checklist (postgres:17-alpine)', () => {
  let db: TestDb
  let app: INestApplication
  let admin: AuthSession
  let member: AuthSession

  beforeAll(async () => {
    db = await startTestDb()
    app = await createTestApp(db.uri)
    // Seed BEFORE the logins: beforeAll runs against an empty DB and loginAs
    // validates credentials against real rows.
    await seedBaseUsers(db.prisma)
    admin = await loginAs(newAgent(app.getHttpServer()), USERS.admin1.email)
    member = await loginAs(newAgent(app.getHttpServer()), USERS.member1.email)
  }, 180_000)

  afterAll(async () => {
    await app?.close()
    await db?.stop()
  })

  beforeEach(async () => {
    await truncateAll(db.prisma)
    await seedBaseUsers(db.prisma)
  })

  // --- authentication gate (global JwtAuthGuard) ---

  it('requires authentication to read a checklist (401)', async () => {
    await seedTask(db, { id: TASK_A_ID, title: 'Visible task', creatorId: USERS.member1.id })
    const anonymous = newAgent(app.getHttpServer())
    await anonymous.get(`/api/v1/tasks/${TASK_A_ID}/checklist`).expect(401)
  })

  // --- CHECK-001: reads ---

  it('lists the checklist sorted by sortOrder for a visible task', async () => {
    await seedTask(db, { id: TASK_A_ID, title: 'Visible task', creatorId: USERS.member1.id })
    await seedItem(db, { id: itemUuid(2), taskId: TASK_A_ID, content: 'Second', completed: false, sortOrder: 1 })
    await seedItem(db, { id: itemUuid(1), taskId: TASK_A_ID, content: 'First', completed: true, sortOrder: 0 })

    const res = await member.agent.get(`/api/v1/tasks/${TASK_A_ID}/checklist`).expect(200)
    expect(res.body.data.map((i: { id: string }) => i.id)).toEqual([itemUuid(1), itemUuid(2)])
    expect(res.body.data[0]).toEqual({
      id: itemUuid(1),
      taskId: TASK_A_ID,
      content: 'First',
      completed: true,
      sortOrder: 0,
      version: 1,
      createdAt: expect.any(String) as unknown as Date,
      updatedAt: expect.any(String) as unknown as Date,
    })
    // A checklist on another task is invisible to the same actor's list view
    await seedTask(db, { id: TASK_B_ID, title: 'Other task', creatorId: USERS.admin1.id })
    await seedItem(db, { id: itemUuid(3), taskId: TASK_B_ID, content: 'Other task', completed: false, sortOrder: 0 })
    const again = await member.agent.get(`/api/v1/tasks/${TASK_A_ID}/checklist`).expect(200)
    expect(again.body.data).toHaveLength(2) // no cross-task leakage
  })

  it('returns an empty checklist when the task has no items', async () => {
    await seedTask(db, { id: TASK_A_ID, title: 'Visible task', creatorId: USERS.member1.id })
    const res = await member.agent.get(`/api/v1/tasks/${TASK_A_ID}/checklist`).expect(200)
    expect(res.body).toEqual({ data: [] })
  })

  // --- CHECK-001: create ---

  it('appends an item as the MEMBER who created the task (201 + Location, server-assigned sortOrder)', async () => {
    await seedTask(db, { id: TASK_A_ID, title: 'Visible task', creatorId: USERS.member1.id })
    await seedItem(db, { id: itemUuid(1), taskId: TASK_A_ID, content: 'Existing', completed: false, sortOrder: 0 })

    const res = await member.agent
      .post(`/api/v1/tasks/${TASK_A_ID}/checklist`)
      .set('X-CSRF-Token', member.csrfToken)
      .send({ content: '  New item  ' })
      .expect(201)

    expect(res.headers.location).toBe(`/api/v1/tasks/${TASK_A_ID}/checklist/${res.body.data.id}`)
    expect(res.body.data).toMatchObject({
      taskId: TASK_A_ID,
      content: 'New item', // trimmed
      completed: false,
      sortOrder: 1, // max(sortOrder)+1 — appended last
      version: 1,
    })
    const stored = await db.prisma.checklistItem.findUnique({ where: { id: res.body.data.id } })
    expect(stored).toMatchObject({ content: 'New item', sortOrder: 1 })
  })

  it('rejects a blank or missing content -> 400 VALIDATION_ERROR', async () => {
    await seedTask(db, { id: TASK_A_ID, title: 'Visible task', creatorId: USERS.member1.id })

    const blank = await member.agent
      .post(`/api/v1/tasks/${TASK_A_ID}/checklist`)
      .set('X-CSRF-Token', member.csrfToken)
      .send({ content: '   ' })
      .expect(400)
    expect(blank.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })

    const missing = await member.agent
      .post(`/api/v1/tasks/${TASK_A_ID}/checklist`)
      .set('X-CSRF-Token', member.csrfToken)
      .send({})
      .expect(400)
    expect(missing.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })

    const tooLong = await member.agent
      .post(`/api/v1/tasks/${TASK_A_ID}/checklist`)
      .set('X-CSRF-Token', member.csrfToken)
      .send({ content: 'x'.repeat(501) })
      .expect(400)
    expect(tooLong.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })
    expect(await db.prisma.checklistItem.count()).toBe(0) // nothing written
  })

  // --- CHECK-002: toggle + content edit (CAS) ---

  it('toggles an item to completed and back with the returned version', async () => {
    await seedTask(db, { id: TASK_A_ID, title: 'Visible task', creatorId: USERS.member1.id })
    await seedItem(db, { id: itemUuid(1), taskId: TASK_A_ID, content: 'Draft', completed: false, sortOrder: 0 })

    const on = await member.agent
      .patch(`/api/v1/tasks/${TASK_A_ID}/checklist/${itemUuid(1)}`)
      .set('X-CSRF-Token', member.csrfToken)
      .send({ completed: true, expectedVersion: 1 })
      .expect(200)
    expect(on.body.data).toMatchObject({ completed: true, version: 2 })

    const off = await member.agent
      .patch(`/api/v1/tasks/${TASK_A_ID}/checklist/${itemUuid(1)}`)
      .set('X-CSRF-Token', member.csrfToken)
      .send({ completed: false, expectedVersion: 2 })
      .expect(200)
    expect(off.body.data).toMatchObject({ completed: false, version: 3 })
    expect(off.body.data.content).toBe('Draft') // toggle never touches content
  })

  it('edits content independently of the toggle (version bumps, completed preserved)', async () => {
    await seedTask(db, { id: TASK_A_ID, title: 'Visible task', creatorId: USERS.member1.id })
    await seedItem(db, { id: itemUuid(1), taskId: TASK_A_ID, content: 'Old copy', completed: true, sortOrder: 0 })

    const res = await member.agent
      .patch(`/api/v1/tasks/${TASK_A_ID}/checklist/${itemUuid(1)}`)
      .set('X-CSRF-Token', member.csrfToken)
      .send({ content: 'New copy', expectedVersion: 1 })
      .expect(200)
    expect(res.body.data).toMatchObject({ content: 'New copy', completed: true, version: 2 })
  })

  it('rejects an expectedVersion mismatch -> 409 STALE_VERSION with the current state', async () => {
    await seedTask(db, { id: TASK_A_ID, title: 'Visible task', creatorId: USERS.member1.id })
    await seedItem(db, { id: itemUuid(1), taskId: TASK_A_ID, content: 'Draft', completed: false, sortOrder: 0 })

    const res = await member.agent
      .patch(`/api/v1/tasks/${TASK_A_ID}/checklist/${itemUuid(1)}`)
      .set('X-CSRF-Token', member.csrfToken)
      .send({ completed: true, expectedVersion: 99 })
      .expect(409)
    expect(res.body).toMatchObject({
      code: 'STALE_VERSION',
      status: 409,
      currentVersion: 1,
    })
    expect(res.body.currentState).toMatchObject({ content: 'Draft', completed: false, sortOrder: 0 })
    const stored = await db.prisma.checklistItem.findUnique({ where: { id: itemUuid(1) } })
    expect(stored).toMatchObject({ completed: false, version: 1 }) // nothing was written
  })

  it('rejects an update body without completed/content -> 400 VALIDATION_ERROR', async () => {
    await seedTask(db, { id: TASK_A_ID, title: 'Visible task', creatorId: USERS.member1.id })
    await seedItem(db, { id: itemUuid(1), taskId: TASK_A_ID, content: 'Draft', completed: false, sortOrder: 0 })

    const res = await member.agent
      .patch(`/api/v1/tasks/${TASK_A_ID}/checklist/${itemUuid(1)}`)
      .set('X-CSRF-Token', member.csrfToken)
      .send({ expectedVersion: 1 })
      .expect(400)
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })
  })

  // --- CHECK-001: reorder (atomic) ---

  it('reorders the whole list atomically and returns the new order', async () => {
    await seedTask(db, { id: TASK_A_ID, title: 'Visible task', creatorId: USERS.member1.id })
    await seedItem(db, { id: itemUuid(1), taskId: TASK_A_ID, content: 'A', completed: false, sortOrder: 0 })
    await seedItem(db, { id: itemUuid(2), taskId: TASK_A_ID, content: 'B', completed: false, sortOrder: 1 })
    await seedItem(db, { id: itemUuid(3), taskId: TASK_A_ID, content: 'C', completed: false, sortOrder: 2 })

    const res = await member.agent
      .patch(`/api/v1/tasks/${TASK_A_ID}/checklist/reorder`)
      .set('X-CSRF-Token', member.csrfToken)
      .send({
        items: [
          { id: itemUuid(3), sortOrder: 0 },
          { id: itemUuid(1), sortOrder: 1 },
          { id: itemUuid(2), sortOrder: 2 },
        ],
      })
      .expect(200)
    expect(res.body.data.map((i: { id: string }) => i.id)).toEqual([itemUuid(3), itemUuid(1), itemUuid(2)])

    const stored = await db.prisma.checklistItem.findMany({
      where: { taskId: TASK_A_ID },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    })
    expect(stored.map((i) => i.id)).toEqual([itemUuid(3), itemUuid(1), itemUuid(2)])
    expect(stored.every((i) => i.version === 1)).toBe(true) // reorder never bumps versions
  })

  it('rejects a reorder payload referencing an item of another task -> 404', async () => {
    await seedTask(db, { id: TASK_A_ID, title: 'Visible task', creatorId: USERS.member1.id })
    await seedTask(db, { id: TASK_B_ID, title: 'Other task', creatorId: USERS.admin1.id })
    await seedItem(db, { id: itemUuid(1), taskId: TASK_A_ID, content: 'A', completed: false, sortOrder: 0 })
    await seedItem(db, { id: itemUuid(2), taskId: TASK_B_ID, content: 'Foreign', completed: false, sortOrder: 0 })

    const res = await member.agent
      .patch(`/api/v1/tasks/${TASK_A_ID}/checklist/reorder`)
      .set('X-CSRF-Token', member.csrfToken)
      .send({ items: [{ id: itemUuid(1), sortOrder: 0 }, { id: itemUuid(2), sortOrder: 1 }] })
      .expect(404)
    expect(res.body).toMatchObject({ code: 'CHECKLIST_ITEM_NOT_FOUND', status: 404 }) // BOLA-safe
  })

  // --- CHECK-002: delete ---

  it('removes an item as the MEMBER creator (200 + last-known state)', async () => {
    await seedTask(db, { id: TASK_A_ID, title: 'Visible task', creatorId: USERS.member1.id })
    await seedItem(db, { id: itemUuid(1), taskId: TASK_A_ID, content: 'Doomed', completed: false, sortOrder: 0 })

    const res = await member.agent
      .delete(`/api/v1/tasks/${TASK_A_ID}/checklist/${itemUuid(1)}`)
      .set('X-CSRF-Token', member.csrfToken)
      .expect(200)
    expect(res.body.data).toMatchObject({ id: itemUuid(1), content: 'Doomed' }) // last-known state
    expect(await db.prisma.checklistItem.count()).toBe(0)
  })

  it('404s on an unknown item or unknown task (never a 500)', async () => {
    await seedTask(db, { id: TASK_A_ID, title: 'Visible task', creatorId: USERS.member1.id })

    const item404 = await member.agent
      .patch(`/api/v1/tasks/${TASK_A_ID}/checklist/${itemUuid(99)}`)
      .set('X-CSRF-Token', member.csrfToken)
      .send({ completed: true, expectedVersion: 1 })
      .expect(404)
    expect(item404.body).toMatchObject({ code: 'CHECKLIST_ITEM_NOT_FOUND', status: 404 })

    const unknownTask = 'ffffffff-ffff-4000-8000-0000000000ff'
    const task404 = await member.agent
      .patch(`/api/v1/tasks/${unknownTask}/checklist/${itemUuid(1)}`)
      .set('X-CSRF-Token', member.csrfToken)
      .send({ completed: true, expectedVersion: 1 })
      .expect(404)
    expect(task404.body).toMatchObject({ code: 'TASK_NOT_FOUND', status: 404 })
  })

  // --- task edit policy (CHECK-002) ---

  it('rejects mutations by a MEMBER unrelated to the task -> 403 FORBIDDEN', async () => {
    await seedTask(db, { id: TASK_B_ID, title: 'Admin task', creatorId: USERS.admin1.id, assigneeId: USERS.admin1.id })

    const add = await member.agent
      .post(`/api/v1/tasks/${TASK_B_ID}/checklist`)
      .set('X-CSRF-Token', member.csrfToken)
      .send({ content: 'sneaky' })
      .expect(403)
    expect(add.body).toMatchObject({ code: 'FORBIDDEN', status: 403 })
    expect(await db.prisma.checklistItem.count()).toBe(0)

    // Reads stay allowed for the unrelated member (task is team-visible)
    const list = await member.agent.get(`/api/v1/tasks/${TASK_B_ID}/checklist`).expect(200)
    expect(list.body.data).toEqual([])
  })

  it('gives a MEMBER 404 on an archived task and an ADMIN 409 TASK_ARCHIVED', async () => {
    await seedTask(db, { id: TASK_ARCHIVED_ID, title: 'Frozen', creatorId: USERS.admin1.id, archivedAt: new Date() })

    const memberAdd = await member.agent
      .post(`/api/v1/tasks/${TASK_ARCHIVED_ID}/checklist`)
      .set('X-CSRF-Token', member.csrfToken)
      .send({ content: 'nope' })
      .expect(404)
    expect(memberAdd.body).toMatchObject({ code: 'TASK_NOT_FOUND', status: 404 }) // BOLA-safe: identical to unknown id
    const memberList = await member.agent.get(`/api/v1/tasks/${TASK_ARCHIVED_ID}/checklist`).expect(404)
    expect(memberList.body).toMatchObject({ code: 'TASK_NOT_FOUND', status: 404 })

    const adminAdd = await admin.agent
      .post(`/api/v1/tasks/${TASK_ARCHIVED_ID}/checklist`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ content: 'nope' })
      .expect(409)
    expect(adminAdd.body).toMatchObject({ code: 'TASK_ARCHIVED', status: 409 })
    expect(await db.prisma.checklistItem.count()).toBe(0) // nothing leaked or written
  })

  it('400s a malformed task/item id (INVALID_FORMAT, never a 500)', async () => {
    const res = await member.agent
      .patch('/api/v1/tasks/not-a-uuid/checklist/not-a-uuid')
      .set('X-CSRF-Token', member.csrfToken)
      .send({ completed: true, expectedVersion: 1 })
      .expect(400)
    expect(res.body).toMatchObject({ code: 'INVALID_FORMAT', status: 400 })
  })
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface TaskSeedInput {
  id: string
  title: string
  creatorId: string
  assigneeId?: string | null
  archivedAt?: Date | null
}

async function seedTask(db: TestDb, input: TaskSeedInput): Promise<void> {
  await db.prisma.task.create({
    data: {
      id: input.id,
      title: input.title,
      description: null,
      status: 'BACKLOG',
      priority: 'MEDIUM',
      assigneeId: input.assigneeId ?? null,
      clientId: null,
      dueDate: null,
      blockedReason: null,
      creatorId: input.creatorId,
      version: 1,
      archivedAt: input.archivedAt ?? null,
      archivedById: input.archivedAt ? input.creatorId : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  })
}

interface ChecklistItemSeedInput {
  id: string
  taskId: string
  content: string
  completed: boolean
  sortOrder: number
}

async function seedItem(db: TestDb, input: ChecklistItemSeedInput): Promise<void> {
  await db.prisma.checklistItem.create({ data: input })
}
