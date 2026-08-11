import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../../../packages/api-contract/src/generated/prisma/client'

/**
 * Single injected Prisma client lifecycle for the whole API (PH-03 DB-001).
 *
 * Prisma 7: the Rust-free client (`generator client`) requires the
 * `@prisma/adapter-pg` driver adapter — it is wired here, not in the schema.
 * `DATABASE_URL` must be the Neon pooled URL at runtime (AP-24); the direct
 * URL (`DIRECT_URL`) is used only by migrations (Prisma CLI).
 *
 * Domains must NOT create their own PrismaClient (AP-37) — inject this
 * service. Pool tuning (connection_limit 10, pool_timeout 10s) bounds Neon
 * connection usage and fails fast instead of hanging under load (API-003).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(configService: ConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: configService.getOrThrow<string>('DATABASE_URL'),
        // pg pool tuning (API-003): max 10 connections, 10s to acquire one.
        max: 10,
        connectionTimeoutMillis: 10_000,
      }),
    })
  }

  async onModuleInit(): Promise<void> {
    await this.$connect()
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
  }
}
