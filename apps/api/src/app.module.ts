// Root module — PH-04 (API-003..AUTH-004, PROF-001, USR-001..005).
//
// Middleware order (configure()): cookie-parser (request-bound, in main.ts)
// -> OriginValidation -> CSRF. Then guards (APP_GUARD order matters):
// ThrottlerGuard -> JwtAuthGuard (@Public opt-out) -> RolesGuard.
// The global ProblemDetailsFilter renders every exception as RFC 9457.
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_FILTER, APP_GUARD } from '@nestjs/core'
import { ServeStaticModule } from '@nestjs/serve-static'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { resolve } from 'node:path'
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
import { HealthModule } from './modules/health/health.module'
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
    HealthModule,
    // OPS-001 (PH-12): unified production build — Nest serves the built Vite
    // SPA (apps/web/dist) so a single origin serves API + UI.
    //
    // serveRoot/renderPath are left at their @nestjs/serve-static v5 defaults:
    // with Express 5 / path-to-regexp v8 a bare renderPath '*' crashes at boot
    // (PathError: Missing parameter name) and serveRoot '/' would compile the
    // fallback route to '//*' (same error). The default '{*any}' fallback is
    // the v8 equivalent and gives the SPA deep-refresh behavior.
    //
    // The exclude must also use v8 syntax ('/api/{*any}') — the v6-era
    // '/api/(.*)' from the old docs throws `Unexpected ( at index 5` at
    // request time. Excluded paths fall through to the regular 404 handling.
    //
    // ServeStaticModule registers in onModuleInit, i.e. AFTER the Nest router:
    // controllers win for /api/*, static acts as the final fallback layer
    // (helmet -> cache-control -> [Nest: CSRF -> routes] -> static).
    ...(process.env.NODE_ENV === 'production'
      ? [
          ServeStaticModule.forRoot({
            rootPath: resolve(__dirname, '../../web/dist'), // apps/api/dist -> <repo>/web/dist
            exclude: ['/api/{*any}'],
          }),
        ]
      : []),
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
