// Test-app builder — replicates the hardened production bootstrap (API-003)
// against a Testcontainers Postgres URI.
//
// Env timing: ConfigModule.forRoot validates the declared-env universe at
// MODULE IMPORT time (before any spec body runs), so the full key set is
// pre-seeded by vitest.e2e.config.ts `test.env`. The container URI is only
// known after beforeAll, so PrismaService is OVERRIDDEN here with a client
// bound to the real URI — the app under test uses the same container as the
// spec's fixtures.
import { VersioningType } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import cookieParser from 'cookie-parser'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../../../../packages/api-contract/src/generated/prisma/client'
import { AppModule } from '../../../src/app.module'
import { AppValidationPipe } from '../../../src/common/pipes/app-validation.pipe'
import { PrismaService } from '../../../src/database/prisma.service'

export async function createTestApp(dbUri: string): Promise<NestExpressApplication> {
  const testPrisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUri }) })
  await testPrisma.$connect()

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    // Global provider override: the app under test talks to the spec's
    // container instead of the placeholder DATABASE_URL.
    .overrideProvider(PrismaService)
    .useValue(testPrisma as unknown as PrismaService)
    .compile()
  const app = moduleRef.createNestApplication<NestExpressApplication>()

  // Mirror main.ts (API-003): prefix, URI versioning, strict pipe, cookies.
  app.set('trust proxy', 1)
  app.setGlobalPrefix('api')
  app.enableVersioning({ type: VersioningType.URI, prefix: 'v', defaultVersion: '1' })
  app.useGlobalPipes(new AppValidationPipe())
  app.use(cookieParser())

  await app.init()
  return app
}
