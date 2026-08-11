// Row-local integrity of the hand-written initial migration (PH-03 DB-007).
//
// Real PostgreSQL via Testcontainers (postgres:17-alpine, AP-32 — SQLite and
// pg-mem are explicitly forbidden for integrity work). The container starts,
// `prisma migrate deploy` applies `migrations/0_init`, then direct raw inserts
// probe the constraints that bypass the API layer (ADR-002, ADR-004, BR-010,
// BR-011, D-6 — CHECK/UNIQUE/FK are the last line of defense).
//
// Own fixtures only (AP-58): never the dev seed. Skipped automatically when
// Docker is unavailable so the plain unit run keeps working.
import { execFileSync } from 'node:child_process'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../../../packages/api-contract/src/generated/prisma/client'

// ---------------------------------------------------------------------------
// Docker availability gate
// ---------------------------------------------------------------------------

function dockerAvailable(): boolean {
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore', timeout: 10_000 })
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Fixtures (AP-58: integration tests never depend on the demo seed)
// ---------------------------------------------------------------------------

const USER_ID = 'aaaaaaaa-aaaa-4000-8000-000000000001'
const OTHER_USER_ID = 'aaaaaaaa-aaaa-4000-8000-000000000002'
const CLIENT_ID = 'aaaaaaaa-aaaa-4000-8000-000000000101'
const TASK_ID = 'aaaaaaaa-aaaa-4000-8000-000000000201'
const CHANGE_ID = 'aaaaaaaa-aaaa-4000-8000-000000000301'
const MISSING_USER_ID = 'ffffffff-ffff-4000-8000-0000000000ff'

// Specs always run with cwd = apps/api (pnpm --filter @briefline/api test:e2e).
const API_DIR = process.cwd()

let container: StartedPostgreSqlContainer
let prisma: PrismaClient

describe.skipIf(!dockerAvailable())('db-integrity (postgres:17-alpine)', () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start()
    const uri = container.getConnectionUri()

    // Apply the hand-written initial migration exactly like CI/prod does.
    // `prisma migrate deploy` is the CLI entry that reads prisma/schema.prisma
    // from cwd; DATABASE_URL + DIRECT_URL are both pointed at the container.
    const cli = require.resolve('prisma/build/index.js')
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: uri, DIRECT_URL: uri },
      stdio: 'pipe',
    })

    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: uri }) })
    await prisma.$connect()
  }, 180_000)

  afterAll(async () => {
    await prisma?.$disconnect()
    await container?.stop()
  })

  beforeEach(async () => {
    // Full wipe between tests; then the minimal row base every probe needs.
    await prisma.$executeRawUnsafe(
      'TRUNCATE "TaskChange", "Task", "Client", "User" RESTART IDENTITY CASCADE',
    )
    await prisma.$executeRawUnsafe(
      `INSERT INTO "User" ("id", "email", "name", "passwordHash", "updatedAt")
       VALUES ($1, $2, $3, $4, $5)`,
      USER_ID,
      'base@briefline.demo',
      'Base User',
      'not-a-real-hash',
      new Date().toISOString(),
    )
    await prisma.$executeRawUnsafe(
      `INSERT INTO "User" ("id", "email", "name", "passwordHash", "updatedAt")
       VALUES ($1, $2, $3, $4, $5)`,
      OTHER_USER_ID,
      'other@briefline.demo',
      'Other User',
      'not-a-real-hash',
      new Date().toISOString(),
    )
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Client" ("id", "companyName", "contactName", "contactEmail", "createdById", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6)`,
      CLIENT_ID,
      'Base Client',
      'Contact',
      'contact@briefline.demo',
      USER_ID,
      new Date().toISOString(),
    )
  })

  // --- smoke: the fixture base itself is insertable (keeps the CHECK/UNIQUE
  // assertions honest — a failure here means the setup broke, not the rule) ---

  it('inserts a minimal valid row (smoke)', async () => {
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "Task" ("id", "title", "creatorId", "updatedAt") VALUES ($1, $2, $3, $4)`,
        TASK_ID,
        'Valid task',
        USER_ID,
        new Date().toISOString(),
      ),
    ).resolves.toBe(1)
  })

  // --- ADR-004: Task.version >= 1 (Task_version_positive, PG 23514) ---
  //
  // Prisma 7 Rust-free (adapter-pg) surfaces driver-level errors on raw
  // queries as P2010 with the original PG code in
  // meta.driverAdapterError.cause.originalCode (the classic P200x mapping only
  // applies to typed ORM queries).

  it('rejects version 0 (ADR-004)', async () => {
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "Task" ("id", "title", "creatorId", "updatedAt", "version")
         VALUES ($1, $2, $3, $4, $5)`,
        TASK_ID,
        'Version zero',
        USER_ID,
        new Date().toISOString(),
        0,
      ),
    ).rejects.toMatchObject({
      code: 'P2010',
      meta: { driverAdapterError: { cause: { originalCode: '23514' } } },
    })
  })

  // --- BR-010/BR-011: blockedReason pair (Task_blocked_reason_required /
  // Task_blocked_reason_cleared, PG 23514) ---

  it('rejects BLOCKED without a blocked reason (BR-010)', async () => {
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "Task" ("id", "title", "creatorId", "updatedAt", "status")
         VALUES ($1, $2, $3, $4, 'BLOCKED')`,
        TASK_ID,
        'Blocked but silent',
        USER_ID,
        new Date().toISOString(),
      ),
    ).rejects.toMatchObject({
      code: 'P2010',
      meta: { driverAdapterError: { cause: { originalCode: '23514' } } },
    })
  })

  it('rejects BLOCKED with a whitespace-only reason (BR-010)', async () => {
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "Task" ("id", "title", "creatorId", "updatedAt", "status", "blockedReason")
         VALUES ($1, $2, $3, $4, 'BLOCKED', $5)`,
        TASK_ID,
        'Blocked with spaces',
        USER_ID,
        new Date().toISOString(),
        '   ',
      ),
    ).rejects.toMatchObject({
      code: 'P2010',
      meta: { driverAdapterError: { cause: { originalCode: '23514' } } },
    })
  })

  it('rejects non-BLOCKED with a live blocked reason (BR-011)', async () => {
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "Task" ("id", "title", "creatorId", "updatedAt", "status", "blockedReason")
         VALUES ($1, $2, $3, $4, 'PENDING', $5)`,
        TASK_ID,
        'Pending with reason',
        USER_ID,
        new Date().toISOString(),
        'stale reason',
      ),
    ).rejects.toMatchObject({
      code: 'P2010',
      meta: { driverAdapterError: { cause: { originalCode: '23514' } } },
    })
  })

  // --- ADR-002: unique on the normalized email (User_email_key, PG 23505) ---
  //
  // The column stores ONLY the normalized value (trim().toLowerCase() is the
  // app's job, ADR-002) — the row-level unique blocks duplicates of that
  // normalized value. A raw INSERT of an un-normalized variant bypasses the
  // app layer and is not what this rule guards against.

  it('rejects a duplicate of the normalized email (ADR-002/BR-002)', async () => {
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "User" ("id", "email", "name", "passwordHash", "updatedAt")
         VALUES ($1, $2, $3, $4, $5)`,
        OTHER_USER_ID,
        'base@briefline.demo', // the exact normalized value of the beforeEach user
        'Exact Duplicate',
        'not-a-real-hash',
        new Date().toISOString(),
      ),
    ).rejects.toMatchObject({
      code: 'P2010',
      meta: { driverAdapterError: { cause: { originalCode: '23505' } } },
    })
  })

  // --- FK integrity (PG 23503): Prisma does not auto-index FKs (AP-07), but
  // the FK constraints themselves are enforced by PostgreSQL ---

  it('rejects a Task referencing a missing creator (FK)', async () => {
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "Task" ("id", "title", "creatorId", "updatedAt") VALUES ($1, $2, $3, $4)`,
        TASK_ID,
        'Orphan task',
        MISSING_USER_ID,
        new Date().toISOString(),
      ),
    ).rejects.toMatchObject({
      code: 'P2010',
      meta: { driverAdapterError: { cause: { originalCode: '23503' } } },
    })
  })

  it('rejects deleting a Task that owns history (D-6 Restrict)', async () => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Task" ("id", "title", "creatorId", "updatedAt") VALUES ($1, $2, $3, $4)`,
      TASK_ID,
      'Task with history',
      USER_ID,
      new Date().toISOString(),
    )
    await prisma.$executeRawUnsafe(
      `INSERT INTO "TaskChange" ("id", "taskId", "actorId", "event") VALUES ($1, $2, $3, 'CREATED')`,
      CHANGE_ID,
      TASK_ID,
      USER_ID,
    )
    await expect(
      prisma.$executeRawUnsafe('DELETE FROM "Task" WHERE "id" = $1', TASK_ID),
    ).rejects.toMatchObject({
      code: 'P2010',
      meta: { driverAdapterError: { cause: { originalCode: '23503' } } },
    })
  })
})
