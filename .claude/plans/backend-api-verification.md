# Backend API Verification — Briefline CRM

**Date:** 2026-08-11
**Task:** DOC-003 — Verificación de APIs exactas de bibliotecas backend NestJS
**Author:** Backend developer agent
**Stack verificado:** NestJS 11 + Express 5 (default) + Node.js 24 LTS + Prisma 7 + PostgreSQL

---

## Resumen ejecutivo — Decisiones clave

1. **CSRF:** `csurf` está **deprecated/archivado** (feb 2021, vulnerabilidad SNYK-JS-CSURF-3021144). Los docs oficiales de NestJS recomiendan **`csrf-csrf`** (v4.0.3) para Express, que implementa el patrón **Signed Double-Submit Cookie** (HMAC-SHA256) recomendado por OWASP. Se combinará con **validación de Origin** (defensa en profundidad) y `SameSite=strict`.
2. **Prisma:** la versión actual es **Prisma 7** (`@prisma/client` 7.9.1). Requiere **driver adapter** (`@prisma/adapter-pg`) y `output` obligatorio en el generador `prisma-client`. `$transaction` interactivo con callback sigue siendo el patrón soportado (el array de queries ya no).
3. **Argon2:** se recomienda el paquete **`argon2`** (node-argon2) v0.45.1 — binding oficial de referencia, PHC strings estándar. Alternativa viable: `@node-rs/argon2` 2.0.2 (napi-rs, sin node-gyp). Parámetros OWASP verificados: `m=19456 KiB (19 MiB), t=2, p=1` con `argon2id`.
4. **NestJS 11 usa Express 5** por defecto (path-to-regexp v8): los wildcards deben nombrarse (`{*splat}`), p. ej. en `exclude` de `ServeStaticModule` y `forRoutes`.
5. **Secure-by-default:** guard JWT global vía `APP_GUARD` + decorator `@Public()` para rutas públicas (patrón oficial de los docs de NestJS).

---

## Versiones verificadas (npm registry, 2026-08-11)

| Paquete | Versión verificada | Notas |
|---|---|---|
| @nestjs/core | 11.x (11.1.6) | Node ≥ 20; Express 5 default |
| @nestjs/jwt | 11.0.2 | depende de jsonwebtoken 9.0.3 |
| @nestjs/passport | 11.0.5 | peer: passport ^0.5–0.7 |
| passport-jwt | 4.x (latest) | estrategia JWT |
| @nestjs/swagger | 11.4.6 | peer: @nestjs/core/common ^11.0.1 |
| @nestjs/throttler | 6.5.0 | API `forRoot([...])` (array) v5+ |
| @nestjs/serve-static | 5.0.5 | peer: express ^5.0.1; usa path-to-regexp 8.4.2 |
| @nestjs/config | 4.0.4 | peer: rxjs ^7.1.0 |
| class-validator | 0.15.1 | |
| class-transformer | 0.5.1 | |
| helmet | 8.3.0 | node >= 18 |
| cookie-parser | 1.4.7 | |
| csrf-csrf | 4.0.3 | patrón double-submit firmado |
| argon2 | 0.45.1 | node >= 16.17; PHC strings |
| @node-rs/argon2 | 2.0.2 | napi-rs; sin node-gyp |
| @prisma/client | 7.9.1 | node ^20.19 \|\| ^22.12 \|\| >= 24.0 |
| prisma (CLI) | 7.x | |
| joi | 18.2.3 | node >= 20; usado para validación de config |

---

## 1. NestJS Authentication & JWT

### Allowed Imports

```typescript
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule, PassportStrategy, AuthGuard } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import {
  Injectable, Module, CanActivate, ExecutionContext, SetMetadata,
  UnauthorizedException, UseGuards, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
```

### Copy-Ready Pattern: JwtModule.registerAsync (config-driven)

Verificado contra: [@nestjs/jwt — Quick Start / API Reference](https://github.com/nestjs/jwt/blob/master/_autodocs/quick-start.md), sección "Register JwtModule with ConfigService".

```typescript
// auth/auth.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: '15m',
          algorithm: 'HS256', // HS256 es el default con secret simétrico; se fija explícito
        },
      }),
    }),
  ],
})
export class AuthModule {}
```

### Copy-Ready: JwtService.signAsync / verifyAsync

Verificado contra: [@nestjs/jwt — API Reference JwtService](https://github.com/nestjs/jwt/blob/master/_autodocs/api-reference-jwt-service.md) y [NestJS docs — Authentication](https://docs.nestjs.com/security/authentication).

```typescript
// auth/auth.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  async issueAccessToken(userId: string, email: string, role: string): Promise<string> {
    const payload = { sub: userId, email, role };
    return this.jwtService.signAsync(payload, { expiresIn: '15m' });
  }

  async verifyAccessToken(token: string): Promise<{ sub: string; email: string; role: string }> {
    try {
      return await this.jwtService.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
```

Nota: `signAsync`/`verifyAsync` son obligatorios si se usa `secretOrKeyProvider` async. Se fusionan opciones de módulo + por-llamada.

### Copy-Ready: JwtStrategy con extracción desde cookie HttpOnly

Verificado contra: [NestJS docs — Recipes/Passport](https://docs.nestjs.com/recipes/passport) (JwtStrategy + JwtAuthGuard) y [passport-jwt README](https://github.com/mikenicholson/passport-jwt) (ExtractJwt.fromExtractors, custom cookie extractor, `algorithms`).

```typescript
// auth/jwt.strategy.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => request?.cookies?.access_token ?? null, // cookie HttpOnly
        ExtractJwt.fromAuthHeaderAsBearerToken(), // fallback para API clients
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
      algorithms: ['HS256'],
    });
  }

  async validate(payload: JwtPayload) {
    // El objeto retornado se asigna a request.user
    return { id: payload.sub, email: payload.email, role: payload.role };
  }
}
```

### Copy-Ready: JwtAuthGuard

Verificado contra: [NestJS docs — Recipes/Passport](https://docs.nestjs.com/recipes/passport), sección "Define JwtAuthGuard".

```typescript
// auth/jwt-auth.guard.ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

### Copy-Ready: Global Auth Guard (secure-by-default) + Public routes

Verificado contra: [NestJS docs — Authorization (APP_GUARD)](https://docs.nestjs.com/security/authorization) y [NestJS docs — Authentication (@Public)](https://docs.nestjs.com/security/authentication) — el patrón `IS_PUBLIC_KEY` + `SetMetadata` es oficial; la extensión del `AuthGuard('jwt')` con `Reflector` es la adaptación canónica del patrón oficial para guards de Passport.

```typescript
// auth/public.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

```typescript
// auth/jwt-auth.guard.ts (versión final, respeta @Public)
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }
}
```

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/jwt-auth.guard';

@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard, // secure-by-default: toda ruta exige JWT salvo @Public()
    },
  ],
})
export class AppModule {}
```

```typescript
// Uso en un controller
@Public()
@Post('login')
@HttpCode(HttpStatus.OK)
signIn(@Body() dto: LoginDto) { ... }
```

### Copy-Ready: @Roles decorator + RolesGuard

Verificado contra: [NestJS docs — Guards](https://docs.nestjs.com/guards) (RolesGuard con Reflector) y [NestJS docs — Authorization](https://docs.nestjs.com/security/authorization) (registro global con APP_GUARD).

```typescript
// auth/roles.decorator.ts
import { SetMetadata } from '@nestjs/common';
import { Role } from './role.enum';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
```

```typescript
// auth/roles.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { Role } from './role.enum';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest();
    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
```

Se registra como guard global (APP_GUARD) o por módulo. `RolesGuard` corre **después** de `JwtAuthGuard` porque NestJS ejecuta los guards en orden de registro.

### Verified Against
- https://docs.nestjs.com/security/authentication — secciones "Authentication", "Enable authentication globally", "@Public decorator" — 2026-08-11
- https://docs.nestjs.com/security/authorization — "Registering a global guard with APP_GUARD" — 2026-08-11
- https://docs.nestjs.com/recipes/passport — JwtStrategy, JwtAuthGuard, PassportModule — 2026-08-11
- https://docs.nestjs.com/guards — RolesGuard con Reflector — 2026-08-11
- https://github.com/nestjs/jwt/blob/master/_autodocs/quick-start.md y api-reference-jwt-service.md — 2026-08-11
- https://github.com/mikenicholson/passport-jwt/blob/master/README.md — ExtractJwt.fromExtractors, cookie extractor, `algorithms` — 2026-08-11

---

## 2. NestJS Validation & Config

### Allowed Imports

```typescript
import { ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { IsString, IsEmail, IsEnum, IsOptional, Length, MaxLength, IsUUID } from 'class-validator';
import { Transform, Expose, Exclude, plainToInstance, instanceToPlain } from 'class-transformer';
import * as Joi from 'joi';
```

### Copy-Ready: ValidationPipe global (whitelist + forbidNonWhitelisted + transform)

Verificado contra: [NestJS docs — Validation](https://docs.nestjs.com/techniques/validation) y [NestJS docs — Pipes](https://docs.nestjs.com/pipes) ("Registering a global ValidationPipe").

```typescript
// main.ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,            // elimina propiedades no declaradas en el DTO
    forbidNonWhitelisted: true, // ERROR si llegan propiedades no declaradas (estricto)
    transform: true,            // convierte payloads planos a instancias del DTO
    transformOptions: { enableImplicitConversion: false }, // evitar conversiones implícitas
    forbidUnknownValues: true,
  }),
);
```

Semántica verificada: `forbidNonWhitelisted` solo tiene efecto con `whitelist: true`; lanza excepción en vez de descartar silenciosamente.

### Copy-Ready: ConfigModule.forRoot con validación bloqueante

Verificado contra: [NestJS docs — Configuration](https://docs.nestjs.com/techniques/configuration), secciones "Schema validation" y "validationOptions". Si la validación falla, **la app no arranca** (bloqueante).

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        PORT: Joi.number().port().default(3000),
        DATABASE_URL: Joi.string().required(),
        JWT_SECRET: Joi.string().min(32).required(),
        CSRF_SECRET: Joi.string().min(32).required(),
        CORS_ORIGINS: Joi.string().required(),
      }),
      validationOptions: {
        allowUnknown: false, // error si hay variables no declaradas en el schema
        abortEarly: true,    // detener en el primer error
      },
    }),
  ],
})
export class AppModule {}
```

Nota verificada: los defaults de `@nestjs/config` son `allowUnknown: true` y `abortEarly: false`; se deben sobreescribir para el modo estricto. Acceso con tipado: `configService.getOrThrow<string>('JWT_SECRET')`.

### Copy-Ready: class-validator decorators (todos verificados)

Verificado contra: [class-validator README](https://github.com/typestack/class-validator) y docs oficiales — 2026-08-11.

```typescript
// auth/dto/login.dto.ts
import { IsEmail, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Email inválido' })
  @MaxLength(255)
  email: string;

  @IsString()
  @Length(8, 72) // argon2 ignora bytes > 72; tope de seguridad
  password: string;
}
```

```typescript
// users/dto/create-user.dto.ts
import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { Role } from '../../auth/role.enum';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(8, 72)
  password: string;

  @IsOptional()
  @IsEnum(Role, { message: 'Role inválido' })
  role?: Role;

  @IsOptional()
  @IsUUID('4')
  companyId?: string;
}
```

Tabla de decorators verificados:

| Decorator | Firmas/opciones verificadas |
|---|---|
| `@IsString()` | type check |
| `@IsEmail(options?, { message? })` | opciones de validator + mensaje custom |
| `@IsEnum(Enum, { message? })` | valida contra valores del enum |
| `@IsOptional()` | `null`/`undefined` → ignora el resto de validadores del campo |
| `@Length(min, max, { message? })` | rango de longitud |
| `@MaxLength(max, { message? })` | longitud máxima |
| `@IsUUID(version)` | versión (p. ej. `'4'`) |
| `@IsString({ each: true })` | valida cada elemento de un array |

### Copy-Ready: class-transformer (@Transform, @Expose, @Exclude)

Verificado contra: [class-transformer README y API decorators](https://github.com/typestack/class-transformer) — 2026-08-11.

```typescript
// users/dto/update-profile.dto.ts
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(2, 100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  displayName?: string;
}
```

```typescript
// users/entities/user-response.dto.ts — allowlist con @Exclude a nivel de clase
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class UserResponseDto {
  @Expose() id: string;
  @Expose() email: string;
  @Expose() displayName: string;
  @Exclude() passwordHash: string; // redundante con @Exclude() de clase, explícito
}
```

Alternativa de serialización automática (patrón oficial NestJS, docs.nestjs.com/techniques/serialization): registrar `ClassSerializerInterceptor` globalmente y usar `@Exclude()` sobre la propiedad a ocultar de una clase entity — las respuestas JSON omiten `passwordHash` automáticamente:

```typescript
import { ClassSerializerInterceptor } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
// app.module.ts providers:
// { provide: APP_INTERCEPTOR, useClass: ClassSerializerInterceptor }
```

Transformaciones manuales verificadas: `plainToInstance(Cls, plain)` y `instanceToPlain(instance)`.

### Verified Against
- https://docs.nestjs.com/techniques/validation — "Stripping properties", "Transform", "forbidNonWhitelisted" — 2026-08-11
- https://docs.nestjs.com/pipes — "Registering a global ValidationPipe", DTO con class-validator — 2026-08-11
- https://docs.nestjs.com/techniques/configuration — "Schema validation", "validationOptions", "isGlobal" — 2026-08-11
- https://github.com/typestack/class-validator/blob/develop/README.md — decorators (IsEmail, IsEnum, IsOptional, Length, MaxLength, IsUUID, mensajes) — 2026-08-11
- https://github.com/typestack/class-transformer/blob/develop/_autodocs/api-decorators.md — @Expose/@Exclude — 2026-08-11

---

## 3. Prisma

### Versión crítica: Prisma 7

Verificado contra: [Prisma docs — Upgrade to v7](https://github.com/prisma/web/blob/main/apps/docs/content/docs/guides/upgrade-prisma-orm/v7.mdx) y [Prisma docs — NestJS guide](https://www.prisma.io/docs/guides/frameworks/nestjs) — 2026-08-11.

Cambios que afectan el setup (v7 vs v5/v6):
- `provider = "prisma-client"` (nuevo cliente Rust-free); `prisma-client-js` se eliminará en el futuro.
- `output` es **obligatorio** en el generador — el cliente ya no se genera en `node_modules`.
- El import es desde la ruta generada, siempre con `/client` al final.
- **Driver adapter obligatorio** para PostgreSQL: `@prisma/adapter-pg` (`PrismaPg`).
- `$transaction` con array de queries **ya no se soporta**; usar siempre callback (interactivo).
- `enableShutdownHooks` ya no es necesario (Prisma 5+).

### Allowed Imports

```typescript
import { PrismaClient } from '../generated/prisma/client'; // ruta del output del generador
import { PrismaPg } from '@prisma/adapter-pg';
import { Injectable, Module, Global, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client'; // namespace con tipos + TransactionIsolationLevel
```

### Copy-Ready: prisma/schema.prisma

Verificado contra: [Prisma docs — schema reference](https://github.com/prisma/web/blob/main/apps/docs/content/docs/orm/reference/prisma-schema-reference.mdx) (@updatedAt, @default(now()), @default(uuid()), @db.Uuid) — 2026-08-11.

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String   @id @default(uuid()) @db.Uuid
  email        String   @unique
  passwordHash String
  role         Role     @default(USER)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  refreshTokens RefreshToken[]
}

model RefreshToken {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @db.Uuid
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())
  revokedAt DateTime?
}

enum Role {
  USER
  ADMIN
}
```

Atributos verificados:
- `@updatedAt` — actualiza automáticamente en cada update (signature oficial).
- `@default(now())` — timestamp actual al crear.
- `@default(uuid())` — UUID generado por Prisma; alternativa PG nativa: `@default(dbgenerated("gen_random_uuid()")) @db.Uuid`.

### Copy-Ready: PrismaService (v7 + adapter)

Verificado contra: [Prisma docs — NestJS guide](https://www.prisma.io/docs/guides/frameworks/nestjs) y [Prisma blog — NestJS Prisma REST API](https://github.com/prisma/web/blob/main/apps/blog/content/blog/nestjs-prisma-rest-api-7D056s1BmOL0/index.mdx) — 2026-08-11.

```typescript
// prisma/prisma.service.ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(configService: ConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: configService.getOrThrow<string>('DATABASE_URL'),
      }),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

### Copy-Ready: PrismaModule (custom NestJS module)

Verificado contra: Prisma blog (mismo source) — patrón oficial `providers` + `exports`; `@Global()` es opcional pero recomendado para evitar imports repetidos.

```typescript
// prisma/prisma.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

Uso: `constructor(private readonly prisma: PrismaService) {}` — inyección directa en cualquier servicio.

### Copy-Ready: $transaction (interactivo)

Verificado contra: [Prisma docs — transactions & runtime](https://github.com/prisma/web/blob/main/apps/docs/content/docs/orm/next/reference/transactions-and-runtime.mdx) y ejemplos oficiales de interactive transactions — 2026-08-11.

```typescript
// auth/auth.service.ts — ejemplo: crear usuario + refresh token atómicamente
import { Prisma } from '../generated/prisma/client';

await this.prisma.$transaction(async (tx) => {
  const user = await tx.user.create({
    data: { email, passwordHash, role: 'USER' },
  });
  await tx.refreshToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  });
  return user;
}, {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 5000,
  timeout: 10000,
});
```

Nota verificada: en Prisma 7 el array de queries (`prisma.$transaction([...])`) ya no se soporta — todo dentro del callback.

### Copy-Ready: Migraciones (dev vs deploy)

Verificado contra: [Prisma docs — Prisma Migrate](https://github.com/prisma/web/blob/main/apps/docs/content/docs/cli/migrate/index.mdx) y [Prisma docs — Best practices](https://github.com/prisma/web/blob/main/apps/docs/content/docs/orm/more/best-practices.mdx) — 2026-08-11.

| Comando | Entorno | Uso |
|---|---|---|
| `npx prisma migrate dev --name <nombre>` | Desarrollo local | Crea y aplica la migración, regenera el cliente |
| `npx prisma migrate deploy` | **Producción/CI** | Aplica migraciones pendientes de forma no interactiva, con advisory locking (seguro ante ejecución concurrente) |
| `npx prisma migrate status` | Ambos | Estado del historial de migraciones |
| `npx prisma db push` | Prototipos | **No** usar en producción (destructivo) |

Reglas oficiales: en producción **solo** `prisma migrate deploy` con migraciones commiteadas; nunca `migrate dev` (puede pedir reset) ni `db push`. CI: ejecutar `prisma migrate deploy` antes de arrancar la app (ejemplo oficial en GitHub Actions con `on: push paths: prisma/migrations/**`).

### Verified Against
- https://www.prisma.io/docs/guides/frameworks/nestjs — PrismaService, PrismaModule — 2026-08-11
- https://github.com/prisma/web/blob/main/apps/docs/content/docs/guides/upgrade-prisma-orm/v7.mdx — generador prisma-client, output obligatorio — 2026-08-11
- https://github.com/prisma/web/blob/main/apps/docs/content/docs/orm/reference/prisma-schema-reference.mdx — @updatedAt, @default(now()), @default(uuid()), @db.Uuid — 2026-08-11
- https://github.com/prisma/web/blob/main/apps/docs/content/docs/cli/migrate/index.mdx — comandos migrate — 2026-08-11
- https://github.com/prisma/web/blob/main/apps/docs/content/docs/orm/more/best-practices.mdx — dev vs deploy — 2026-08-11

---

## 4. Argon2

### Decisión: `argon2` vs `@node-rs/argon2`

Verificado contra: [node-argon2 API Reference / Security Notes](https://github.com/ranisalt/node-argon2/blob/master/_autodocs/api-reference.md), [@node-rs/argon2 (npm)](https://www.npmjs.com/package/%40node-rs/argon2) y OWASP Password Storage Cheat Sheet — 2026-08-11.

**Recomendación: `argon2` (node-argon2) v0.45.1** como paquete primario:

| Criterio | `argon2` 0.45.1 | `@node-rs/argon2` 2.0.2 |
|---|---|---|
| Binding | Referencia oficial (PHC winner), node-gyp con prebuilds | Rust via napi-rs |
| Instalación | node-gyp solo si no hay prebuild | Sin node-gyp, binarios prebuilt |
| Formato hash | PHC string (`$argon2id$v=19$m=19456,t=2,p=1$...`) | PHC string también soportado |
| verify() | `Promise<boolean>` constante-time | `Promise<boolean>` |
| Tamaño | ~3.7 MB | ~476 KB |
| OWASP params | Documentados por el propio mantenimiento (security-notes) | vía README |
| Node 24 | engines >= 16.17, prebuilds actuales | engines >= 10 |

Ambos son válidos y producen PHC strings verificables. `argon2` tiene mayor adopción y documentación de seguridad alineada con OWASP; `@node-rs/argon2` evita node-gyp. **Si el CI/entorno presenta problemas de compilación, `@node-rs/argon2` es el plan B sin cambio de API de alto nivel.**

### Allowed Imports

```typescript
import * as argon2 from 'argon2'; // API: argon2.hash(), argon2.verify(), argon2.argon2id
```

### Copy-Ready: hash + verify (parámetros OWASP verificados)

Verificado contra: [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) — Argon2id `m=19456 (19 MiB), t=2, p=1` — y [node-argon2 Security Notes](https://github.com/ranisalt/node-argon2/blob/master/_autodocs/security-notes.md) ("OWASP minimum of 19 MiB") — 2026-08-11.

```typescript
// auth/argon2.util.ts
import * as argon2 from 'argon2';

// OWASP Argon2id: m=19456 KiB (19 MiB), t=2, p=1 — una de las 5 configs de igual defensa del cheat sheet
const HASH_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // KiB (19 MiB)
  timeCost: 2,       // iteraciones
  parallelism: 1,    // hilos
  hashLength: 32,    // 256 bits de salida
};

export async function hashPassword(plain: string): Promise<string> {
  // Retorna PHC string: $argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>
  return argon2.hash(plain, HASH_OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  // Comparación constante-time; false para hashes inválidos, no lanza
  return argon2.verify(hash, plain);
}
```

Firmas verificadas:
- `argon2.hash(password: Buffer | string, options?: Options): Promise<string>` — options: `type` (argon2d/argon2i/argon2id), `memoryCost`, `timeCost`, `parallelism`, `hashLength`, `secret?`.
- `argon2.verify(digest: string, password: Buffer | string, options?): Promise<boolean>` — constante-time; `false` si no coincide o hash inválido.
- Defaults de la librería (si no se pasan options): m=65536 (64 MiB), t=3, p=4, hashLength 32, argon2id.

### Verified Against
- https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html — sección Argon2id: `m=19456, t=2, p=1`; mínimo "19 MiB, 2 iterations, 1 parallelism" — 2026-08-11
- https://github.com/ranisalt/node-argon2/blob/master/_autodocs/api-reference.md — hash/verify signatures — 2026-08-11
- https://github.com/ranisalt/node-argon2/blob/master/_autodocs/security-notes.md — configs recomendadas, mínimo OWASP 19 MiB — 2026-08-11
- https://www.npmjs.com/package/@node-rs/argon2 — API, defaults (memoryCost 4096 KB, timeCost 3, parallelism 1, Argon2id default) — 2026-08-11

---

## 5. Cookies & CSRF

### Allowed Imports

```typescript
import * as cookieParser from 'cookie-parser'; // middleware
import { doubleCsrf } from 'csrf-csrf';        // double-submit firmado
import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';
```

### Copy-Ready: cookie-parser en NestJS (Express)

Verificado contra: [NestJS docs — Cookies](https://docs.nestjs.com/techniques/cookies) — 2026-08-11.

```bash
npm i cookie-parser
npm i -D @types/cookie-parser
```

```typescript
// main.ts
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser()); // opcional: cookieParser(secret) habilita signedCookies
  // ...
}
```

- `request.cookies` / `request.signedCookies` disponibles en handlers.
- Leer una cookie con decorator custom `@Cookies()` (patrón oficial con `createParamDecorator`).
- **Orden:** `cookieParser` SIEMPRE antes del middleware de CSRF.

### Copy-Ready: Response.cookie() (Express 5)

Verificado contra: [Express docs — res.cookie](https://expressjs.com/en/4x/api.html) (`res.cookie(name, value, [options])`: `domain, path, maxAge, expires, httpOnly, secure, sameSite, signed`) — 2026-08-11.

```typescript
// auth/auth.controller.ts — en NestJS usar @Res({ passthrough: true })
import { Controller, Post, Res } from '@nestjs/common';
import { Response } from 'express';

@Post('login')
async login(@Res({ passthrough: true }) res: Response) {
  const accessToken = await this.authService.issueAccessToken(...);
  const refreshToken = await this.authService.issueRefreshToken(...);

  res.cookie('access_token', accessToken, {
    httpOnly: true,          // inaccesible a JS
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',      // defensa en profundidad anti-CSRF
    path: '/',
    maxAge: 15 * 60 * 1000,  // 15 min
  });
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth',       // restringir envío al endpoint de refresh
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  return { ok: true };
}
```

Nota: `@Res({ passthrough: true })` — patrón oficial de NestJS para poder usar `response.cookie()` manteniendo el pipeline normal.

### csurf: DEPRECATED — no usar

Evidencia verificada (2026-08-11):
- Deprecado oficialmente por el equipo de Express (feb 2021): aviso "due to the large influx of security vulnerability reports… largely unnecessary for modern SPA-based applications". Repo archivado.
- Vulnerabilidad conocida: **SNYK-JS-CSURF-3021144** (CSRF bypass).
- Crítica de la comunidad: defaults inseguros (`signed`, `secure`, `httpOnly`, `sameSite` en `false`).
- La página oficial de NestJS de CSRF **ni lo menciona** y recomienda `csrf-csrf` para Express.

### Copy-Ready: CSRF con csrf-csrf v4 (Signed Double-Submit Cookie)

Verificado contra: [NestJS docs — Security/CSRF](https://docs.nestjs.com/security/csrf) (recomienda `csrf-csrf` para Express) y [csrf-csrf v4.0.3 README](https://cdn.jsdelivr.net/npm/csrf-csrf@4.0.3/README.md) — 2026-08-11.

**API exacta v4 (importante: cambió vs v1):**
- Opciones requeridas: `getSecret: (req?) => string | string[]` y `getSessionIdentifier: (req) => string`.
- Opciones con default: `cookieName` (`"__Host-psifi.x-csrf-token"`), `cookieOptions` (`{ sameSite: "strict", path: "/", secure: true, httpOnly: true }` — `signed` no disponible), `getCsrfTokenFromRequest` (default: header `x-csrf-token`), `size` (32), `ignoredMethods` (`["GET","HEAD","OPTIONS"]`), `hmacAlgorithm` ("sha256"), `errorConfig` (403 "invalid csrf token").
- Retorna: `doubleCsrfProtection`, `generateCsrfToken(req, res)`, `validateRequest(req)`, `invalidCsrfTokenError`.
- Cookie = `${hmac}.${randomValue}`; el token a enviar en el header lo devuelve `generateCsrfToken`. **Nunca** devolver el valor del cookie desde `getCsrfTokenFromRequest` (anularía la protección).

```typescript
// common/csrf/csrf.init.ts
import { Request } from 'express';
import { doubleCsrf } from 'csrf-csrf';
import { ConfigService } from '@nestjs/config';

export function initCsrf(configService: ConfigService) {
  const secret = configService.getOrThrow<string>('CSRF_SECRET');
  const isProduction = configService.get('NODE_ENV') === 'production';

  const { invalidCsrfTokenError, generateCsrfToken, validateRequest, doubleCsrfProtection } = doubleCsrf({
    getSecret: () => secret,
    // Identificador de sesión estable: el JWT de acceso (HMAC ligado a la sesión)
    getSessionIdentifier: (req: Request) => req.cookies?.['access_token'] ?? 'anonymous',
    // Nota: NO usar prefijo __Host- (requiere HTTPS; rompe dev local). Usar nombre custom.
    cookieName: 'csrf-token',
    cookieOptions: {
      sameSite: 'strict',
      path: '/',
      secure: isProduction,
      httpOnly: true, // el frontend recibe el token vía response body de /auth/csrf-token
    },
    size: 32,
    ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  });

  return { invalidCsrfTokenError, generateCsrfToken, validateRequest, doubleCsrfProtection };
}
```

```typescript
// main.ts — wiring completo
import * as cookieParser from 'cookie-parser';
import { initCsrf } from './common/csrf/csrf.init';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.use(cookieParser()); // SIEMPRE antes del CSRF

  const { generateCsrfToken, doubleCsrfProtection } = initCsrf(configService);

  // Endpoint público para emitir el token (GET — ignorado por doubleCsrfProtection)
  app.getHttpAdapter().get('/api/auth/csrf-token', (req, res) => {
    res.json({ csrfToken: generateCsrfToken(req, res) });
  });

  // Protege todos los métodos no ignorados registrados después (POST/PUT/PATCH/DELETE)
  app.use(doubleCsrfProtection);
  // ...
}
```

Flujo frontend: `GET /api/auth/csrf-token` → guarda `csrfToken` en memoria → envía header `x-csrf-token: <token>` en todo POST/PUT/PATCH/DELETE. Fallo → `403 invalid csrf token`.

### Copy-Ready: Origin Validation (defensa en profundidad OWASP)

Verificado contra: [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) — "Origin Header Validation": el header `Origin` no puede ser alterado programáticamente; validarlo contra el origen esperado. Nota OWASP: `Origin` puede faltar (GETs same-origin, redirects 302) — no rechazar si ausente, pero validar cuando presente.

```typescript
// common/middleware/origin-validation.middleware.ts
import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OriginValidationMiddleware implements NestMiddleware {
  private readonly allowedOrigins: string[];

  constructor(configService: ConfigService) {
    this.allowedOrigins = configService
      .getOrThrow<string>('CORS_ORIGINS')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  use(req: Request, _res: Response, next: NextFunction) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }
    const origin = req.headers.origin;
    if (!origin) {
      return next(); // sin navegador (curl, server-to-server): no aplica
    }
    try {
      const originUrl = new URL(origin).origin;
      const allowed = this.allowedOrigins.some((o) => new URL(o).origin === originUrl);
      if (!allowed) {
        throw new ForbiddenException('Origin not allowed');
      }
    } catch (e) {
      if (e instanceof ForbiddenException) throw e;
      throw new ForbiddenException('Invalid Origin header');
    }
    next();
  }
}
```

Registro: en `AppModule` vía `MiddlewareConsumer` (para inyección con DI), aplicado a todas las rutas.

### Verified Against
- https://docs.nestjs.com/techniques/cookies — cookie-parser, `@Res({ passthrough: true })`, `request.cookies` — 2026-08-11
- https://expressjs.com/en/4x/api.html — `res.cookie(name, value, [options])` — 2026-08-11
- https://docs.nestjs.com/security/csrf — recomienda `csrf-csrf` para Express; aviso de prerequisitos (cookie-parser) — 2026-08-11
- https://cdn.jsdelivr.net/npm/csrf-csrf@4.0.3/README.md — API v4 exacta (getSecret, getSessionIdentifier, defaults, ejemplo completo) — 2026-08-11
- https://github.com/expressjs/discussions/issues/155 — deprecación de csurf — 2026-08-11
- https://socket.dev/npm/package/csurf/overview/1.2.0 — SNYK-JS-CSURF-3021144, repo archivado — 2026-08-11
- https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html — Signed Double-Submit Cookie, Origin validation, limitaciones — 2026-08-11

---

## 6. Swagger/OpenAPI

### Allowed Imports

```typescript
import { DocumentBuilder, SwaggerModule, ApiTags, ApiOperation, ApiResponse, ApiProperty, ApiPropertyOptional, ApiCookieAuth, ApiBearerAuth } from '@nestjs/swagger';
```

### Copy-Ready: Setup en main.ts

Verificado contra: [@nestjs/swagger — DocumentBuilder API](https://github.com/nestjs/swagger/blob/master/_autodocs/api-reference/DocumentBuilder.md) y [NestJS docs — OpenAPI Introduction](https://docs.nestjs.com/openapi/introduction) — 2026-08-11.

```typescript
// main.ts
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const swaggerConfig = new DocumentBuilder()
  .setTitle('Briefline CRM API')
  .setDescription('API de Briefline CRM')
  .setVersion('1.0.0')
  .setOpenAPIVersion('3.0.0')
  .addCookieAuth('access_token', { type: 'apiKey', in: 'cookie', name: 'access_token' }, 'cookie-auth')
  .addTag('auth')
  .build();

const document = SwaggerModule.createDocument(app, swaggerConfig);
SwaggerModule.setup('api/docs', app, document);
```

Métodos verificados de `DocumentBuilder`: `setTitle`, `setDescription`, `setVersion`, `setOpenAPIVersion`, `addServer`, `addTag`, `addSecurity`, `addBearerAuth`, `addOAuth2`, `addApiKey`, `addBasicAuth`, **`addCookieAuth(cookieName?, options?, securityName?)`**, `addSecurityRequirements`, `build()`.

### Copy-Ready: Decorators verificados

Verificado contra: [@nestjs/swagger — Decorators API](https://github.com/nestjs/swagger/blob/master/_autodocs/api-reference/Decorators.md) — 2026-08-11.

```typescript
// auth/auth.controller.ts
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Iniciar sesión', operationId: 'login' })
  @ApiResponse({ status: 200, description: 'Sesión iniciada; cookies HttpOnly fijadas' })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  @ApiResponse({ status: 403, description: 'invalid csrf token' })
  signIn(@Body() dto: LoginDto) { ... }

  @Get('me')
  @ApiCookieAuth('access_token') // exige cookie-auth definida en DocumentBuilder
  @ApiOperation({ summary: 'Perfil del usuario autenticado' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  me(@Request() req) { ... }
}
```

```typescript
// users/dto/user-response.dto.ts — @ApiProperty con DTOs validados
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class UserResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ description: 'Nombre visible', maxLength: 100 })
  @IsOptional()
  @IsString()
  displayName?: string;
}
```

Firmas verificadas: `@ApiTags(...tags)`, `@ApiOperation({ summary, description, operationId })`, `@ApiResponse({ status, description, type, isArray, overrideExisting? })`, `@ApiProperty(options)`, `@ApiPropertyOptional(options)` (shorthand de `required: false`), `@ApiCookieAuth(name?)` (ClassDecorator & MethodDecorator).

Nota: con el CLI plugin de Swagger (`@nestjs/swagger/plugin`) los decorators `@ApiProperty` se generan automáticamente desde los DTOs de class-validator; si se usa, los imports de `@ApiProperty` son opcionales en los DTOs.

### Verified Against
- https://github.com/nestjs/swagger/blob/master/_autodocs/api-reference/DocumentBuilder.md — todos los métodos — 2026-08-11
- https://github.com/nestjs/swagger/blob/master/_autodocs/api-reference/Decorators.md — ApiTags, ApiResponse, ApiOperation, ApiCookieAuth, ApiPropertyOptional — 2026-08-11
- https://docs.nestjs.com/openapi/introduction — setup, SwaggerModule.createDocument/setup — 2026-08-11

---

## 7. Throttling

### Allowed Imports

```typescript
import { ThrottlerModule, ThrottlerGuard, Throttle, seconds } from '@nestjs/throttler';
```

### Copy-Ready: ThrottlerModule global + límite específico de login

Verificado contra: [@nestjs/throttler README](https://github.com/nestjs/throttler/blob/master/README.md) (forRoot array, named throttlers, @Throttle) y [API Reference](https://github.com/nestjs/throttler/blob/master/_autodocs/integration-guide.md) — 2026-08-11.

```typescript
// app.module.ts
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,   // ventana 60 s
        limit: 100,    // 100 req/ventana por IP
      },
      {
        name: 'auth',
        ttl: 60_000,
        limit: 5,      // estricto para endpoints de autenticación
      },
    ]),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard, // global; respeta los @Throttle por ruta
    },
  ],
})
export class AppModule {}
```

### Copy-Ready: @Throttle por ruta (login)

Verificado: `@Throttle(options: Record<string, ThrottlerMethodOrControllerOptions>)` — options por throttler: `limit`, `ttl`, `blockDuration`, `getTracker`, `generateKey`. El helper `seconds(n)` está exportado por el paquete.

```typescript
// auth/auth.controller.ts
@Public()
@Throttle({ auth: { limit: 5, ttl: seconds(60), blockDuration: seconds(300) } })
@Post('login')
async login(@Body() dto: LoginDto) { ... }
```

Alternativa sin helper: `@Throttle({ auth: { limit: 5, ttl: 60_000 } })`. Si se usa solo el throttler `default` sin nombres, la firma es `@Throttle({ default: { limit: 5, ttl: seconds(10) } })`.

### Verified Against
- https://github.com/nestjs/throttler/blob/master/README.md — forRoot([{name,ttl,limit}]), @Throttle override, seconds() — 2026-08-11
- https://github.com/nestjs/throttler/blob/master/_autodocs/integration-guide.md — registro global APP_GUARD — 2026-08-11
- https://github.com/nestjs/throttler/blob/master/_autodocs/api-reference/decorators.md — signature @Throttle — 2026-08-11

---

## 8. ServeStaticModule (SPA en producción)

### Allowed Imports

```typescript
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
```

### Copy-Ready: Servir el build de Vite

Verificado contra: [NestJS docs — Recipes/Serve Static](https://docs.nestjs.com/recipes/serve-static) — 2026-08-11.

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'client', 'dist'), // build de Vite
      // renderPath por defecto '*' → sirve index.html en cualquier ruta (client-side routing)
      exclude: ['/api/{*splat}'], // Express 5: wildcard nombrado (path-to-regexp v8)
    }),
  ],
})
export class AppModule {}
```

Semántica verificada:
- `rootPath`: directorio del build estático (Vite `dist`).
- `renderPath` (default `'*'`): devuelve `index.html` en rutas no encontradas → funciona el routing del SPA.
- `exclude`: rutas que NO deben recibir el SPA (p. ej. la API). **Con Express 5 los wildcards deben nombrarse**: `/api/{*splat}` (nota de la migración a NestJS 11).
- En desarrollo no se sirve el SPA desde Nest (se usa el dev server de Vite); este módulo es solo producción.

### Verified Against
- https://docs.nestjs.com/recipes/serve-static — forRoot, rootPath, renderPath, exclude — 2026-08-11
- https://docs.nestjs.com/migration-guide — Express 5 / path-to-regexp v8 (wildcards nombrados) — 2026-08-11

---

## 9. Security Headers (helmet + CORS)

### Allowed Imports

```typescript
import helmet from 'helmet';
```

### Copy-Ready: helmet en main.ts

Verificado contra: [helmet README](https://github.com/helmetjs/helmet/blob/main/README.md) — 2026-08-11. Aplica 13 headers por defecto: `Content-Security-Policy`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, `Origin-Agent-Cluster`, `Referrer-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `X-DNS-Prefetch-Control`, `X-Download-Options`, `X-Frame-Options`, `X-Permitted-Cross-Domain-Policies`, `X-Powered-By` (remoción) y `Cross-Origin-Embedder-Policy` (Helmet 8 añadió `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`).

```typescript
// main.ts
import helmet from 'helmet';

app.use(helmet()); // defaults seguros

// CSP con excepción para Swagger UI (patrón de los docs de NestJS)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: [`'self'`],
        styleSrc: [`'self'`, `'unsafe-inline'`], // Swagger UI necesita inline styles
        imgSrc: [`'self'`, 'data:', 'validator.swagger.io'],
        scriptSrc: [`'self'`, `https:`, `'unsafe-inline'`],
      },
    },
  }),
);
```

Firmas verificadas de `contentSecurityPolicy(options)`: `directives`, `useDefaults` (default true), `reportOnly`. Default CSP de Helmet: `default-src 'self'; base-uri 'self'; font-src 'self' https: data:; form-action 'self'; frame-ancestors 'self'; img-src 'self' data:; object-src 'none'; script-src 'self'; script-src-attr 'none'; style-src 'self' https: 'unsafe-inline'; upgrade-insecure-requests`.

### Copy-Ready: CORS con cookies

```typescript
// main.ts
app.enableCors({
  origin: process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()) ?? [], // lista blanca explícita
  credentials: true, // OBLIGATORIO para cookies (con Set-Cookie + Authorization header)
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
});
```

Nota OWASP verificada: nunca `Access-Control-Allow-Origin: *` con credenciales; lista blanca de orígenes exactos. (API: `enableCors` es de `INestApplication`, ver docs.nestjs.com/security/cors.)

### Verified Against
- https://github.com/helmetjs/helmet/blob/main/README.md — helmet(options), contentSecurityPolicy(options), default CSP — 2026-08-11
- https://docs.nestjs.com/openapi/introduction — configuración CSP para Swagger UI — 2026-08-11

---

## CSRF Strategy Decision

**Recomendación: `csrf-csrf` v4.0.3 (Signed Double-Submit Cookie) + Origin Validation + SameSite cookies.**

Justificación con referencias verificadas (2026-08-11):

1. **`csurf` está descartado.** Deprecated oficialmente por el equipo de Express (feb 2021, [expressjs/discussions#155](https://github.com/expressjs/discussions/issues/155)), repo archivado, vulnerabilidad [SNYK-JS-CSURF-3021144](https://socket.dev/npm/package/csurf/overview/1.2.0) y defaults inseguros. La página oficial [NestJS Security/CSRF](https://docs.nestjs.com/security/csrf) recomienda `csrf-csrf` para Express — la única doc CSRF de NestJS para el adapter default.

2. **`csrf-csrf` implementa exactamente el patrón que pide el plan** ("double-submit CSRF protection"): el doble envío **firmado** (HMAC-SHA256 del identificador de sesión + valor aleatorio de 32 bytes, comparación constante-time, cookie `${hmac}.${random}` + header `x-csrf-token`). OWASP marca el *naive* double-submit como DISCOURAGED (bypasseable por inyección de cookies en subdominios) y recomienda la variante **Signed** que este paquete implementa ([OWASP CSRF Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)).

3. **Origin validation como defensa en profundidad** (requisito del plan): middleware propio que valida el header `Origin` contra `CORS_ORIGINS` en métodos de mutación. OWASP lo avala: `Origin` es un header prohibido que el navegador fija; no rechazar si está ausente (limitaciones documentadas: GETs same-origin, redirects 302, proxies que quitan Referer).

4. **SameSite=strict + HttpOnly + Secure en las cookies** como capa adicional (OWASP: SameSite es útil como defensa en profundidad, no reemplaza CSRF).

5. **Ajustes para el stack JWT/cookie de Briefline:**
   - `getSessionIdentifier` usa el valor del cookie `access_token` → el HMAC queda ligado a la sesión JWT.
   - Nombre de cookie custom (`csrf-token`), no el default `__Host-psifi.x-csrf-token`: el prefijo `__Host-` exige HTTPS y rompe el dev local en http.
   - `cookieOptions.httpOnly: true` es seguro porque el frontend recibe el token por response body (`GET /api/auth/csrf-token`) y lo envía por header — nunca leyendo el cookie.
   - **Login también queda protegido** (defensa anti login-CSRF): el frontend pide el token CSRF antes de autenticarse; `GET` está en `ignoredMethods` por default.

**Stack de seguridad final:** helmet (headers) → CORS lista blanca + credentials → cookie-parser → Origin validation → CSRF double-submit firmado → guards globales (Throttler → JWT → Roles) → ValidationPipe global.

---

## Checklist de dependencias (npm, backend)

```bash
npm i @nestjs/common @nestjs/core @nestjs/config @nestjs/jwt @nestjs/passport @nestjs/swagger @nestjs/throttler @nestjs/serve-static
npm i passport passport-jwt jsonwebtoken class-validator class-transformer argon2 cookie-parser csrf-csrf helmet joi
npm i @prisma/client @prisma/adapter-pg prisma
npm i -D @types/passport-jwt @types/cookie-parser @types/express
npx prisma generate
```

---

## Sources

- https://docs.nestjs.com/security/authentication | https://docs.nestjs.com/security/authorization | https://docs.nestjs.com/recipes/passport | https://docs.nestjs.com/guards — NestJS auth, guards, @Public, APP_GUARD, RolesGuard (2026-08-11)
- https://docs.nestjs.com/techniques/validation | https://docs.nestjs.com/pipes | https://docs.nestjs.com/techniques/configuration | https://docs.nestjs.com/techniques/cookies | https://docs.nestjs.com/recipes/serve-static | https://docs.nestjs.com/openapi/introduction | https://docs.nestjs.com/security/csrf | https://docs.nestjs.com/migration-guide — NestJS docs oficiales (2026-08-11)
- https://github.com/nestjs/jwt/blob/master/_autodocs/quick-start.md | api-reference-jwt-service.md — @nestjs/jwt (2026-08-11)
- https://github.com/mikenicholson/passport-jwt/blob/master/README.md — passport-jwt (2026-08-11)
- https://github.com/nestjs/swagger/blob/master/_autodocs/api-reference/DocumentBuilder.md | Decorators.md — @nestjs/swagger (2026-08-11)
- https://github.com/nestjs/throttler/blob/master/README.md | _autodocs/integration-guide.md | _autodocs/api-reference/decorators.md — @nestjs/throttler (2026-08-11)
- https://www.prisma.io/docs/guides/frameworks/nestjs | https://github.com/prisma/web (upgrade v7, migrate, prisma-schema-reference, transactions) — Prisma 7 (2026-08-11)
- https://github.com/ranisalt/node-argon2/blob/master/_autodocs/api-reference.md | security-notes.md — node-argon2 (2026-08-11)
- https://www.npmjs.com/package/@node-rs/argon2 — @node-rs/argon2 (2026-08-11)
- https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html — Argon2id m=19456/t=2/p=1 (2026-08-11)
- https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html — signed double-submit, Origin validation (2026-08-11)
- https://cdn.jsdelivr.net/npm/csrf-csrf@4.0.3/README.md — csrf-csrf v4 API exacta (2026-08-11)
- https://github.com/expressjs/discussions/issues/155 | https://socket.dev/npm/package/csurf/overview/1.2.0 — deprecación csurf (2026-08-11)
- https://github.com/helmetjs/helmet/blob/main/README.md — helmet 8 (2026-08-11)
- https://expressjs.com/en/4x/api.html — res.cookie (2026-08-11)
