// Bootstrap — API-003 (PH-04). Hardened NestJS entrypoint.
//
// Stack order (R-5): helmet -> CORS (credentials, allowlist) -> cookie-parser
// -> compression -> trust proxy (rate-limit IPs behind a single hop) ->
// global prefix + URI versioning -> strict validation pipe -> 100kb body
// limit -> shutdown hooks. Middlewares are registered via AppModule.configure
// (OriginValidation -> CSRF) so they run inside the Nest pipeline.
import helmet from 'helmet'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import { NestFactory } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { VersioningType } from '@nestjs/common'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from './app.module'
import { AppValidationPipe } from './common/pipes/app-validation.pipe'
import { CustomLogger } from './common/logger/custom.logger'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new CustomLogger('Briefline'),
    bufferLogs: true,
  })
  const configService = app.get(ConfigService)
  const nodeEnv = configService.get<string>('NODE_ENV') ?? 'development'

  app.use(helmet())
  app.enableCors({
    origin: (configService.get<string>('CORS_ORIGINS') ?? 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim()),
    credentials: true, // HttpOnly cookie auth (ADR-001)
  })
  app.use(cookieParser())
  app.use(compression())
  app.set('trust proxy', 1) // one reverse proxy hop (AUTH-004 IP accuracy)

  app.setGlobalPrefix('api')
  app.enableVersioning({ type: VersioningType.URI, prefix: 'v', defaultVersion: '1' })

  app.useGlobalPipes(new AppValidationPipe())
  app.useBodyParser('json', { limit: '100kb' })
  app.enableShutdownHooks()

  app.useLogger(new CustomLogger('Briefline'))

  const port = configService.get<number>('PORT') ?? 3000
  await app.listen(port, '0.0.0.0')
  app.get(CustomLogger).log(`Briefline API listening on http://0.0.0.0:${port}/api/v1 (${nodeEnv})`)
}

void bootstrap()
