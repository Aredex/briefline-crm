// E2E/integration config — `pnpm test:e2e` (vitest run --config vitest.e2e.config.ts).
//
// `env` feeds the declared-env universe BEFORE any spec (or the AppModule) is
// imported — ConfigModule.forRoot validates at import time, so the Joi gate
// needs the full key set up front. The DATABASE_URL here is only a
// placeholder: each spec boots its own postgres:17-alpine container and the
// PrismaService is overridden (helpers/test-app.ts) with a client bound to the
// real container URI.
//
// fileParallelism: false keeps the containers and the in-memory throttle
// storage fully isolated between files (one Postgres at a time).
import { defineConfig } from 'vitest/config'

const TEST_JWT_SECRET = 'test-jwt-secret-0123456789abcdef0123456789abcdef'
const TEST_CSRF_SECRET = 'test-csrf-secret-0123456789abcdef0123456789abcdef'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/integration/**/*.spec.ts'],
    fileParallelism: false, // one Postgres container at a time
    testTimeout: 180_000, // container start + migrate deploy + seed
    hookTimeout: 180_000,
    pool: 'forks', // child-process pool: safest for Testcontainers + spawn
    env: {
      NODE_ENV: 'test',
      PORT: '0',
      DATABASE_URL: 'postgresql://briefline:briefline-local@localhost:5432/briefline',
      DIRECT_URL: 'postgresql://briefline:briefline-local@localhost:5432/briefline',
      JWT_SECRET: TEST_JWT_SECRET,
      CSRF_SECRET: TEST_CSRF_SECRET,
      CORS_ORIGINS: 'http://localhost:5173',
    },
  },
})
