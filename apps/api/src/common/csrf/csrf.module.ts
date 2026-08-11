// CSRF module — global provider pair for the csrf-csrf utilities.
//
// CSRF_VALIDATE: token validation for the global CsrfMiddleware (runs after
// cookie-parser and Origin validation, before the guards).
// CSRF_GENERATE: token generation/rotation for the auth flow (GET /auth/csrf,
// login rotation bound to the fresh JWT, logout re-bind to 'anonymous').
import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Request, Response } from 'express'
import { initCsrf } from './csrf.init'

export const CSRF_VALIDATE = Symbol('CSRF_VALIDATE')
export const CSRF_GENERATE = Symbol('CSRF_GENERATE')

export type CsrfValidator = (req: Request) => boolean
export type CsrfGenerator = (req: Request, res: Response) => string

@Global()
@Module({
  providers: [
    {
      provide: CSRF_VALIDATE,
      useFactory: (configService: ConfigService): CsrfValidator => initCsrf(configService).validateRequest,
      inject: [ConfigService],
    },
    {
      provide: CSRF_GENERATE,
      useFactory: (configService: ConfigService): CsrfGenerator => initCsrf(configService).generateCsrfToken,
      inject: [ConfigService],
    },
  ],
  exports: [CSRF_VALIDATE, CSRF_GENERATE],
})
export class CsrfModule {}
