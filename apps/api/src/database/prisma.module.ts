import { Global, Module } from '@nestjs/common'
import { PrismaService } from './prisma.service'

/**
 * Global Prisma module (PH-03 DB-001): one provider, exported globally so
 * domain modules can inject PrismaService without importing the module.
 * Register PrismaModule (together with ConfigModule.forRoot) in AppModule
 * during PH-04 (API-003) when the bootstrap is hardened.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
