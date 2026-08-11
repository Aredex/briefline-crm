# DevOps Platform Validation — Briefline CRM
**Date:** 2026-08-11
**Task:** DOC-005 — Revalidar límites y capacidades de Render, Neon y GitHub Actions para el plan de despliegue.
**Status:** VIABLE con ajustes (ver Conclusión)

> Fuentes primarias: render.com/docs (nuevos workspace plans, abril 2026), neon.com/docs (restructuración enero 2026 post-adquisición Databricks), docs.github.com + artículos de terceros actualizados a 2026. Los límites cambiaron significativamente en los últimos 12 meses; validar en el dashboard al momento del deploy.

---

## Render Web Service

### Current Plan (Free/Individual)

| Feature | Limit | Impact |
|---|---|---|
| Existencia del plan free | Sí. Nuevo modelo "Workspace Plans" desde abril 2026 (Free, 1 miembro de equipo) | Plan sigue disponible para demo |
| Instancias | Hasta **25 servicios** por workspace (todos los tipos, incluyendo suspendidos) | Un Web Service + Static Site caben sin problema |
| Memoria / CPU | **512 MB RAM, 0.1 CPU** por instancia free | Suficiente para NestJS pequeño; evitar cargas pesadas |
| Cold start | **~30-60 s** tras inactividad (Render muestra página de loading propia) | Requiere loading state en la SPA + disclosure en README |
| Idle sleep (spin-down) | **15 min** de inactividad (reducido de 30 min en sept 2025). En feb 2026 el tráfico WebSocket también cuenta como actividad | El servicio duerme solo; el cold start es la contrapartida |
| Horas de instancia | **750 h/mes por workspace** (= 1 servicio free encendido 24/7). Al agotarse, TODOS los servicios free del workspace se suspenden hasta el mes siguiente | Con el spin-down, las horas consumidas ≈ uso real. Solo 1 servicio siempre-activo |
| Banda ancha (egress) | **5 GB/mes** incluidos (antes 100 GB en planes legacy), $0.15/GB extra | OK para demo; ojo con assets grandes descargados |
| Build minutes | 500 min de pipeline/mes | CI de app pequeña: sobrado |
| Custom domains | 2 incluidos ($0.25/mes cada extra) | Suficiente |
| Secrets / env vars | Sí, variables de entorno por servicio + Secret Files. Nunca commitear secrets | Usar env vars en dashboard o blueprint `render.yaml` |
| Health check | `healthCheckPath`: requiere respuesta 2xx/3xx; timeout 5 s por check; ventana de 15 min → deploy fallido se cancela y se mantiene el anterior | Definir `/api/health` explícito (port-binding solo prueba liveness, no readiness) |
| Puerto | Obligatorio bindear al `PORT` de env (default 10000) en `0.0.0.0`. Puertos reservados: 18012, 18013, 19099 | NestJS: `app.listen(process.env.PORT, '0.0.0.0')` |
| Rollback | Sí: automático (health check falla 15 min → se cancela el deploy, queda el anterior) + manual (Deploys → Rollback) | Seguridad ante deploys rotos |
| Persistent disk | Disponible, PERO: single-instance only y **desactiva zero-downtime deploys**; no se monta durante el build | NO usar disk en free; PostgreSQL (Neon) debe guardar todo estado |
| WebSockets | Soportados; cero-downtime solo aplica al handshake inicial (las conexiones activas se caen al terminar la instancia vieja) | Implementar reconnection logic si se usan |
| SMTP / email | **Bloqueado desde sept 2025 en servicios free** | ⚠️ CRÍTICO si el CRM envía emails (ver Riesgos) |
| Regiones | Oregon (US-West), Frankfurt (EU), Ohio (US-East), Singapur | Elegir región y emparejarla con Neon |
| Credit card | No requerida | — |

### Recommended Configuration

```yaml
# render.yaml (blueprint, idempotente y reproducible)
services:
  - type: web
    name: briefline-crm-api
    runtime: node
    plan: free
    region: oregon            # o frankfurt; debe coincidir con la región de Neon
    healthCheckPath: /api/health
    buildCommand: npm ci && npm run build
    startCommand: npm run start:prod
    envVars:
      - key: DATABASE_URL
        sync: false           # secret, se define en el dashboard
      - key: DIRECT_URL
        sync: false
      - key: NODE_ENV
        value: production
```

- **Build command:** `npm ci && npm run build`
- **Start command:** `npm run start:prod` (NestJS sirve la SPA estática desde `dist` con `ServeStaticModule` en producción)
- **Health check path:** `/api/health` (devolver 200 solo cuando DB esté conectada; 503 mientras inicializa)
- **Port:** `process.env.PORT` (NestJS escucha en `0.0.0.0`)
- **Secrets:** definir `DATABASE_URL` y `DIRECT_URL` en el dashboard (o como secret files), nunca en el repo
- **Filesystem:** efímero y recreado en cada deploy → todo estado persistente en Neon

---

## Neon PostgreSQL

### Current Plan (Free)

| Feature | Limit | Impact |
|---|---|---|
| Existencia del plan free | Sí. Reestructurado en enero 2026 (modelo usage-based post-adquisición Databricks) | Sigue disponible |
| Storage | **0.5 GB por proyecto** (antes 5 GB globales). Hasta 100 proyectos free por cuenta | Ajustado para MVP/demo; vigilar crecimiento |
| Compute | **100 CU-hours/proyecto/mes**; baseline 0.25 CU (~1 GB RAM, 0.25 vCPU); autoscaling hasta 2 CU en free | Sobra para una demo; scale-to-zero mantiene el consumo mínimo |
| Scale-to-zero | 5 min de inactividad (fijo en free, no configurable). Cold start ~0.5-2 s | Latencia inicial imperceptible vs. Render |
| Branches | **10 branches por proyecto** (copy-on-write, no consumen storage extra) | Branch por feature/testing sin costo |
| Egress | 5 GB/proyecto/mes | OK |
| History (PITR) | 6 h de instant restore (hasta 1 GB) | Suficiente |
| Expiry / suspensión | Si se agotan CU-hours, egress o storage → el compute se **suspende** hasta el siguiente ciclo mensual o upgrade. **No borra datos** | Riesgo bajo para demo |
| Regiones AWS activas | `aws-us-west-2` (Oregon), `aws-eu-central-1` (Frankfurt), us-east-1/2, London, Singapore, Sydney, São Paulo. Las regiones Azure quedaron deprecated (proyectos free inactivos 90+ días sujetos a borrado desde oct 2026) | Elegir **Oregon** o **Frankfurt**, la misma que Render |
| Upgrade | Free → Launch ($19/mes, pay-per-use): solo cambio de billing, sin migración | Escapatoria fácil sin tocar código |

### Connection Strategy

| Use case | Tipo de conexión | Notas |
|---|---|---|
| Prisma Client (runtime, la API) | **Pooled** (`-pooler` en hostname) | PgBouncer en modo transaction; hasta **10,000 conexiones cliente por compute** |
| Prisma Migrate / `db push` (migraciones) | **Direct** (sin `-pooler`) | `max_connections` escala con compute: ~104-112 a 0.25 CU, ~225 a 0.5 CU, ~419-450 a 1 CU |
| Script de reset diario (GHA) | Direct (conexión corta única) | Una sola conexión, sin necesidad de pooler |

- **Pooled URL for Prisma:** `DATABASE_URL="postgresql://user:pass@ep-xxx-pooler.<region>.aws.neon.tech/db?sslmode=require&connect_timeout=15"`
- **Direct URL for migrations:** `DIRECT_URL="postgresql://user:pass@ep-xxx.<region>.aws.neon.tech/db?sslmode=require"` (en `prisma.config.ts` o `directUrl` del schema en Prisma <6)
- **SSL mode: `require`** — Neon exige TLS. `channel_binding=require` en Postgres 17+. `connect_timeout=15` para tolerar el wake-up del compute (evita error P1001)
- **Prisma pool:** `connection_limit` bajo (5-10) y `pool_timeout` 10 s; no crear un cliente por request. Ojo: en Prisma 7 los defaults del driver-adapter cambian (idle timeout 10 s vs 300 s en v6)
- **Región recomendada:** `aws-us-west-2` (Oregon) si Render se despliega en Oregon; `aws-eu-central-1` (Frankfurt) si se elige Frankfurt. La región del proyecto Neon es fija (no se puede cambiar después de crearlo)

---

## GitHub Actions

### Free Tier

| Feature | Limit |
|---|---|
| Minutes/month (repo privado) | **2,000 min** + 500 MB artifact storage + 10 GB cache/repo |
| Concurrencia | 20 jobs concurrentes (plan free) |
| Overage | Linux 2-core $0.006/min (precios de runners bajaron hasta 39% en enero 2026); self-hosted en privados $0.002/min desde marzo 2026 |
| Duración job | 6 h máx por job |

| Schedule feature | Soporte |
|---|---|
| `on: schedule` (cron) | Sí — POSIX cron, **solo UTC**, intervalo mínimo 5 min |
| Retraso máximo | Sin garantía: documentado ~15 min en alta carga, pero en la práctica **30-60+ min** y ocasionalmente runs saltados. GitHub solo garantiza el encolado, no la hora |
| `workflow_dispatch` (reset manual) | Sí — botón en UI + disparo por API REST. **Siempre combinarlo con `schedule`** |
| Auto-disable | Los workflows schedule se **desactivan tras 60 días de inactividad del repo** (sin commits/PRs/issues) |
| Issue conocido | En repos privados de cuentas personales free, a veces el `schedule` no se registra (workaround: togglear privado→público→privado o cambiar la hora del cron, evitar minuto 0) |

**Consumo estimado del proyecto:** CI (typecheck + test, ~2-3 runs/día) + reset diario (~1-2 min) ≈ 150-300 min/mes → muy por debajo de los 2,000.

---

## Daily Reset Strategy

### Recommended Approach

**Opción A (recomendada): GitHub Actions se conecta DIRECTAMENTE a Neon.**

1. Workflow `daily-reset.yml` con `on: schedule` (cron `0 8 * * *` UTC — 10:00/11:00 hora europea, demo fresca en horario laboral) + `workflow_dispatch`.
2. Concurrency guard: `concurrency: { group: daily-reset, cancel-in-progress: false }` para que nunca corran dos resets en paralelo.
3. El job ejecuta `pnpm reset:db` (script idempotente: TRUNCATE + seed determinístico en transacción; safe para re-ejecución).
4. Conexión **directa** a Neon (una conexión corta y única; `sslmode=require`) usando `DATABASE_URL`/`RESET_URL` almacenada como **GitHub Actions secret** — nunca en el repo.
5. Sin endpoint destructivo público: se cumple la restricción del plan. El reset es solo DB-side.

**¿IP allowlisting?** NO es viable ni necesario: los runners de GitHub usan rangos IP dinámicos (publicados pero cambiantes) y Neon no ofrece allowlist de IPs de entrada (autenticación con password + TLS). La seguridad se apoya en credenciales secretas y SSL.

**Opción B (fallback):** endpoint interno `POST /api/admin/reset` protegido por header secreto compartido (`X-Reset-Token`, comparación en tiempo constante), invocado por el mismo workflow. Añade superficie de ataque y un secret más en Render. Solo usar si la conexión directa desde GHA a Neon fuera bloqueada en el futuro (hoy no lo está). **No exponer nunca** el reset como endpoint público sin auth.

**Safeguards:**
- El secret de reset (o `DIRECT_URL` del proyecto Neon) debe ser de un **rol con permisos mínimos** (solo la DB del proyecto; si Neon lo permite, un rol sin DDL más allá del reset).
- El script debe fallar ruidosamente (exit ≠ 0) si el TRUNCATE no puede ejecutarse; con retry manual vía `workflow_dispatch`.
- Programar el cron evitando el minuto 0 (ej. `8 8 * * *` → hh:mm 08:08) para esquivar el issue de registros no disparados en repos privados free.

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| Cambios en tiers gratuitos (Render cambió planes en abr 2026, Neon en ene 2026) | Medium-Alta | Documentar límites; deploy reproducible vía `render.yaml` + workflow; bajo vendor lock-in (NestJS + Prisma + Postgres estándar) → portar a Fly.io/Railway es barato |
| Cold start Render 30-60 s | Alta (seguro) | Loading state en SPA durante el primer request; disclosure en README; opcional keep-alive cada 5 min (UptimeRobot) — consume horas de la cuota, NO recomendado |
| **SMTP bloqueado en Render free (sept 2025)** | Seguro | ⚠️ Si el CRM necesita enviar email (invitaciones, notificaciones): usar proveedor transaccional por API HTTPS (Resend free ~100 emails/día, SendGrid trial, Mailgun trial) — no SMTP desde Render. **Decisión de producto pendiente** |
| Cold start Neon (>1-2 s + wake-up) | Baja | `connect_timeout=15` en la connection string; Prisma pool bajo |
| Límite de conexiones Neon | Baja | Pooled URL (10K conexiones); `connection_limit` 5-10 en Prisma; solo el reset usa direct |
| Storage Neon 0.5 GB agotado | Media (largo plazo) | Watch de uso; para MVP/demo con datos sembrados alcanza; upgrade a Launch sin migración |
| Suspensión de Neon por límites (CU-hours/egress) | Baja | Data no se borra; se reanuda el mes siguiente; 100 CU-hours/mes sobran |
| 750 h de instancia agotadas (multiple servicios activos) | Media | Mantener UN solo Web Service free + Static Site (los static no cuentan horas); spin-down preserva la cuota |
| Egress 5 GB/mes | Baja | Demo con poco tráfico; comprimir/bundlear assets |
| Schedule de GHA retrasado/omitido | Media | Reset diario no es time-critical; `workflow_dispatch` como fallback manual; cron en minuto no-cero; 60-day inactivity auto-disable → el repo tendrá actividad por CI |
| Cambio de precios de runners GHA (mar 2026, self-hosted) | Baja | Usamos runners hosted incluidos en la cuota free |

---

## Conclusion

**SÍ, el plan de despliegue es viable con los tiers gratuitos actuales (agosto 2026).** Los tres servicios siguen ofreciendo plan free sin tarjeta de crédito y con capacidad suficiente para un MVP/demo:

- **Render free** existe y permite 1 Web Service NestJS con 512 MB RAM; el spin-down de 15 min con cold start de 30-60 s es la limitación principal (manejable con loading state + README disclosure).
- **Neon free** existe (0.5 GB/proyecto, 100 CU-hours, 10 branches, 10K conexiones pooled, SSL requerido) y se empareja en región con Render (Oregon `aws-us-west-2` o Frankfurt `aws-eu-central-1`).
- **GitHub Actions free** cubre CI + reset diario con margen amplio (2,000 min/mes).

### Ajustes recomendados

1. **Confirmar requisitos de email del CRM.** Si envía emails, planear un proveedor transaccional por API (Resend/SendGrid) — Render free bloquea SMTP desde sept 2025. Es la decisión de mayor impacto funcional.
2. **Prisma con dos URLs:** `DATABASE_URL` pooled + `DIRECT_URL` direct (migraciones), `sslmode=require`, `connect_timeout=15`, `connection_limit` 5-10.
3. **Neon en la misma región que Render** (Oregon o Frankfurt); la región de Neon es inmutable tras la creación.
4. **Reset diario:** workflow GHA schedule + `workflow_dispatch`, conexión directa a Neon vía secret, script idempotente, `concurrency` guard, cron en minuto no-cero. Sin endpoint destructivo público (Opción A). Mantener Opción B (endpoint interno con secret compartido) como fallback documentado.
5. **Health check** explícito en `/api/health` (200 solo con DB conectada); bind a `process.env.PORT` en `0.0.0.0`; persistencia de estado SOLO en Neon (filesystem efímero).
6. **Un solo servicio free** en Render para no agotar las 750 h/mes; static site si se separa la SPA.
7. **README:** disclosure del cold start de Render y de los límites free actuales; link a este documento.

### Alternativas si el tier free cambiara

Portabilidad alta (Dockerfile + Postgres estándar + Prisma): **Fly.io** (allowances mensuales free), **Railway** (crédito inicial/trial), **DigitalOcean App Platform**, o el plan Individual de Render (~$7/mes, sin spin-down). El costo de migración sería de horas, no de días.
