// prisma.config.ts — Prisma 7 CLI configuration (PH-04 infra fix).
//
// Prisma 7 moved connection URLs out of schema.prisma (P1012): the CLI
// connection lives here. Runtime still uses the driver adapter in
// PrismaService (DATABASE_URL, pooled); Migrate/Studio use DIRECT_URL
// (Neon direct — pgbouncer pooled URLs reject DDL/shadow-db creation).
//
// The repo keeps its .env at the workspace root; scripts run with cwd =
// apps/api, so dotenv loads ../../.env explicitly.
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'prisma/config'

const apiDir = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(apiDir, '../../.env') })
dotenv.config({ path: path.resolve(apiDir, '.env') })

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Migrations must hit the direct URL; fall back to DATABASE_URL for
    // local dev/test containers that set only that one.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
  },
})
