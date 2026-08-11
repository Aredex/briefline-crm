// Shared fixtures + DB bootstrap for PH-04 integration specs (AP-32/33, AP-58).
//
// Each spec file owns ONE postgres:17-alpine container: beforeAll starts it
// and runs `prisma migrate deploy` exactly like CI/prod; beforeEach wipes the
// tables and reseeds the base users, so every test starts from a known state.
// The demo argon2 hash is precomputed (matches prisma/seed.ts) — specs never
// run argon2 (AP-27: fast, deterministic tests).
//
// Skipped automatically when Docker is unavailable (describe.skipIf).
import { execFileSync } from 'node:child_process'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { PrismaPg } from '@prisma/adapter-pg'
import {
  PrismaClient,
  UserRole,
  UserStatus,
  type User,
} from '../../../../../packages/api-contract/src/generated/prisma/client'

export const DEMO_PASSWORD = 'briefline-demo-2026'
// argon2id PHC for DEMO_PASSWORD, precomputed — same string as prisma/seed.ts.
export const DEMO_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,p=1,t=2$DtMFf58lBRt9rW+g6miBjQ$/F6rLUVvTE6Mxvhsamq5DmAhMlSGAq9qyn/Dm5RMp9k'

export interface UserFixture {
  id: string
  email: string
  name: string
  role: UserRole
  status: UserStatus
}

export const USERS: Record<'admin1' | 'admin2' | 'member1' | 'member6', UserFixture> = {
  admin1: {
    id: 'aaaaaaaa-aaaa-4000-8000-000000000001',
    email: 'admin1@briefline.demo',
    name: 'Admin One',
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
  },
  admin2: {
    id: 'aaaaaaaa-aaaa-4000-8000-000000000002',
    email: 'admin2@briefline.demo',
    name: 'Admin Two',
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
  },
  member1: {
    id: 'aaaaaaaa-aaaa-4000-8000-000000000003',
    email: 'member1@briefline.demo',
    name: 'Member One',
    role: UserRole.MEMBER,
    status: UserStatus.ACTIVE,
  },
  member6: {
    id: 'aaaaaaaa-aaaa-4000-8000-000000000006',
    email: 'member6@briefline.demo',
    name: 'Member Six',
    role: UserRole.MEMBER,
    status: UserStatus.INACTIVE, // BR-004: INACTIVE never assigns tasks
  },
}

// Specs always run with cwd = apps/api (pnpm --filter @briefline/api test:e2e).
const API_DIR = process.cwd()

export function dockerAvailable(): boolean {
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore', timeout: 10_000 })
    return true
  } catch {
    return false
  }
}

export interface TestDb {
  uri: string
  prisma: PrismaClient
  stop: () => Promise<void>
}

/** Starts a Postgres container and applies the real migrations (AP-32). */
export async function startTestDb(): Promise<TestDb> {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start()
  const uri = container.getConnectionUri()

  const cli = require.resolve('prisma/build/index.js')
  execFileSync(process.execPath, [cli, 'migrate', 'deploy'], {
    cwd: API_DIR,
    env: { ...process.env, DATABASE_URL: uri, DIRECT_URL: uri },
    stdio: 'pipe',
  })

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: uri }) })
  await prisma.$connect()
  return {
    uri,
    prisma,
    stop: async () => {
      await prisma.$disconnect()
      await container.stop()
    },
  }
}

/** Full wipe between tests (FK order: children before parents). */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "contacts", "TaskChange", "Task", "Client", "User" RESTART IDENTITY CASCADE',
  )
}

/** Base row set every PH-04 spec starts from (AP-58: never the dev seed). */
export async function seedBaseUsers(prisma: PrismaClient): Promise<User[]> {
  const users: User[] = []
  for (const fixture of Object.values(USERS)) {
    users.push(
      await prisma.user.create({
        data: { ...fixture, passwordHash: DEMO_PASSWORD_HASH, lastLoginAt: null },
      }),
    )
  }
  return users
}
