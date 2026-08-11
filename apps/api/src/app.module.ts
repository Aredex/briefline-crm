// Root module — PH-04 (API-003..AUTH-004, PROF-001, USR-001..005).
//
// Middleware order (configure()): cookie-parser (request-bound, in main.ts)
// -> OriginValidation -> CSRF. Then guards (APP_GUARD order matters):
// ThrottlerGuard -> JwtAuthGuard (@Public opt-out) -> RolesGuard.
// The global ProblemDetailsFilter renders every exception as RFC 9457.
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_FILTER, APP_GUARD } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { validateEnv } from './config/configuration'
import { ProblemDetailsFilter } from './common/filters/problem-details.filter'
import { CsrfModule } from './common/csrf/csrf.module'
import { CsrfMiddleware } from './common/csrf/csrf.middleware'
import { OriginValidationMiddleware } from './common/middleware/origin-validation.middleware'
import { CustomLogger } from './common/logger/custom.logger'
import { PrismaModule } from './database/prisma.module'
import { AuthModule } from './modules/auth/auth.module'
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard'
import { RolesGuard } from './modules/auth/guards/roles.guard'
import { ProfileModule } from './modules/profile/profile.module'
import { UsersModule } from './modules/users/users.module'
import { ClientsModule } from './modules/clients/clients.module'
import { TasksModule } from './modules/tasks/tasks.module'
import { DashboardModule } from './modules/dashboard/dashboard.module'

@Module({
  imports: [
    // Validates the declared env universe (Joi) at bootstrap — a missing
    // JWT_SECRET/CSRF_SECRET (or a malformed DATABASE_URL) fails fast (API-003).
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
    // Global throttling: default 100 req/min; the 'auth' tier exists here ONLY
    // so the per-route @Throttle({auth}) override on POST /auth/login can
    // reference it (its values are replaced per-route: 5/min + 300s block).
    // A hard limit on 'auth' at the GLOBAL level would throttle EVERY request
    // of the IP (named throttlers apply to all routes), starving GET /auth/csrf.
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 100 },
      { name: 'auth', ttl: 60_000, limit: 100 },
    ]),
    CsrfModule,
    PrismaModule,
    AuthModule,
    ProfileModule,
    UsersModule,
    ClientsModule,
    TasksModule,
    DashboardModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    CustomLogger,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(OriginValidationMiddleware, CsrfMiddleware)
      .forRoutes('*')
  }
}
