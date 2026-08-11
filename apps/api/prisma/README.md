# Briefline CRM — Prisma (persistencia PH-03)

Schema, migración inicial, seed y reset del demo data.

## Layout

| Path | Qué es |
|---|---|
| `schema.prisma` | Schema declarativo (PH-03 DB-002). Espejo de `.claude/plans/data-model.md` §2. |
| `migrations/0_init/migration.sql` | Migración inicial **escrita a mano** (DB-003): tipos enum, tablas, FKs, índices (DB-004) y CHECKs row-local (§4.1 del data-model). |
| `migrations/migration_lock.toml` | Lock de proveedor (`postgresql`). No editar. |
| `seed.ts` | Seed determinista: 8 usuarios, 12 clientes, 36 tareas, 124 TaskChange (DB-005). |
| `reset.ts` | TRUNCATE + re-seed para dev/staging y el reset diario de demos (DB-006). |

## Generación del cliente

El generator `prisma-client` (Prisma 7, sin runtime Rust) tiene `output` obligatorio;
aquí apunta a `../../packages/api-contract/src/generated/prisma` (fuera de `apps/api`).

```bash
pnpm --filter @briefline/api prisma:generate
```

> **Advertencia (TS6059 / layout de emit):** importar el cliente desde fuera de
> `apps/api` es intencional (contrato compartido, un solo client — AP-37), pero
> puede provocar avisos de `noEmit`/layout en algunos setups de `tsc`. Resuelto
> para PH-04/ARCH si aparece en `verify_cmd`.

## Migraciones en dev

```bash
# Schema nuevo → migración nueva (solo dev, con BD local o Neon direct)
pnpm --filter @briefline/api prisma:migrate -- --name <slug>

# Aplicar migraciones pendientes en dev
pnpm --filter @briefline/api prisma:deploy
```

`DATABASE_URL` es la URL **pooled** de Neon en runtime; `DIRECT_URL` (Neon direct)
es la que usa la CLI de Prisma para migraciones (AP-24). Ambas salen del env.

## Migraciones en CI / producción

```bash
pnpm --filter @briefline/api prisma:deploy   # → prisma migrate deploy
```

`migrate deploy` es la única operación de schema permitida fuera de dev.

### NUNCA en producción

- `prisma db push` — no deja migración, rompe el histórico de schema (AP-05).
- `prisma migrate reset` — borra datos.
- `prisma migrate dev` — puede pedir reset o generar migraciones ad-hoc.
- `prisma migrate dev --name x` ni en CI: es interactivo y destructivo.

Toda evolución de schema es una migración forward-only nueva (regla R-2 del
protocolo). Si una migración ya desplegada necesita cambios: **nueva** migración,
nunca editar la existente.

## Seed y reset

```bash
pnpm --filter @briefline/api prisma:seed    # idempotente: upsert por IDs fijos
pnpm --filter @briefline/api prisma:reset   # TRUNCATE CASCADE + re-seed
```

- `reset.ts` usa `RESET_URL` (conexión **directa**) si está seteada, si no
  `DATABASE_URL` — TRUNCATE es DDL y la pooled URL de Neon lo rechaza.
- El seed es determinista: UUIDs formales fijos, timestamps relativos a la
  ejecución (overdue / due-today / recently-completed estables en cada corrida),
  hash Argon2id precomputado (no se recalcula en runtime) y autoverificación de
  fixtures al final (fracasa con exit != 0 si el demo data se desvía del §8).
- **Reset diario de demos** (GitHub Actions, sugerido): cron que corre
  `prisma:reset` contra el staging con `RESET_URL` en secrets. Nunca un
  endpoint HTTP (AP-43): el reset solo se ejecuta donde ya hay shell + creds.
- `reset.ts` no se importa desde tests; los tests de integración usan fixtures
  propios (AP-58).

## Credenciales demo

Todos los usuarios comparten la contraseña demo:

```
briefline-demo-2026
```

- `admin@briefline.demo` / `admin2@briefline.demo` — ADMIN
- `member@briefline.demo` … `member6@briefline.demo` — MEMBER

La contraseña es pública de propósito (OBJ-005, data-model §8.1); los hashes
Argon2id del seed son los de esa contraseña (AP-54: m=19456 KiB, t=2, p=1).

## Añadir o editar CHECKs

Prisma no expresa CHECK constraints: viven en SQL manual (data-model §4.1).
Cada cambio es **una migración nueva**, no un edit de `0_init`:

1. `pnpm prisma:migrate -- --create-only --name add_some_check`
2. `ALTER TABLE ... ADD CONSTRAINT ... CHECK (...)` en la `migration.sql` nueva.
3. `prisma migrate deploy` en dev, verificar con `prisma validate` (schema y
   migraciones no deben divergir).
4. Reflejar la regla en el data-model.md y en el test de integridad
   (`apps/api/test/integration/db-integrity.spec.ts`, patrón row-local).

Regla general: la BD debe poder rechazar por sí sola cualquier write inválido
que intente saltarse la API (ADR-002/004, BR-010/011, D-6) — esa es la última
línea de defensa.
