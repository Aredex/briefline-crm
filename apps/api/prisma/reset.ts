// Full demo reset — PH-03 DB-006 (data-model.md §8.6).
//
// TRUNCATE + deterministic re-seed. Intended for dev, staging and the daily
// reset of demo environments (GitHub Actions cron with RESET_URL). NEVER
// exposed as an HTTP endpoint (AP-43): the reset credential can only be used
// where a shell + connection string are already available.
//
// Run with: pnpm --filter @briefline/api prisma:reset
// (tsx prisma/reset.ts)
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../../packages/api-contract/src/generated/prisma/client'
import { runSeed } from './seed'

// TRUNCATE is DDL — Neon's pooled (pgbouncer transaction-mode) URL rejects it.
// Use RESET_URL (direct) when set; fall back to DATABASE_URL for local dev.
const RESET_URL = process.env.RESET_URL ?? process.env.DATABASE_URL

async function main(): Promise<void> {
  if (!RESET_URL) {
    console.error('prisma:reset requires RESET_URL (direct connection) or DATABASE_URL.')
    process.exitCode = 1
    return
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: RESET_URL }),
  })

  try {
    await prisma.$connect()
    // data-model §8.6: full wipe of demo data, identity restart, FK-cascade
    // protection for anything the seed does not own (AP-58: tests never rely
    // on this — they run migrations + their own fixtures).
    await prisma.$executeRawUnsafe(
      'TRUNCATE "task_labels", "labels", "comments", "checklist_items", "contacts", "TaskChange", "Task", "Client", "User" RESTART IDENTITY CASCADE',
    )
    const stats = await runSeed(prisma)
    console.log(
      `Reset complete: ${stats.users} users, ${stats.clients} clients, ` +
        `${stats.tasks} tasks, ${stats.changes} task changes.`,
    )
  } catch (err) {
    console.error('Reset failed:', err instanceof Error ? err.message : err)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

void main()
