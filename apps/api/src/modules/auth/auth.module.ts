// Auth module — AUTH-001/AUTH-002 (PH-04, ADR-001).
//
// Wires the JWT strategy (cookie-first + Bearer fallback) and the auth
// endpoints. Guards are registered GLOBALLY in AppModule (JwtAuthGuard +
// RolesGuard as APP_GUARD providers), not per-module — authentication is
// opt-out via @Public() (AP-01). JWT signing pins HS256/issuer/audience, and
// the token lifetime comes from JWT_TTL_SECONDS (8h, ADR-001).
import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER, JWT_TTL_SECONDS } from './auth.constants'
import { JwtStrategy } from './strategies/jwt.strategy'

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: JWT_TTL_SECONDS,
          algorithm: JWT_ALGORITHM,
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
