# Baseline documental oficial

**Estado:** Fase 0 completada  
**Fecha de revisión:** 2026-08-11

Este documento fija las fuentes y patrones permitidos que los planes de implementación deberán consultar. La disponibilidad de una librería no autoriza a inventar APIs: cada fase deberá verificar la versión fijada y copiar patrones de su documentación oficial.

## Stack preliminar permitido

- React 19 + TypeScript + Vite; no Create React App.
- NestJS 11 y Node.js 24 LTS.
- PostgreSQL, versión final condicionada al proveedor.
- Prisma ORM con migraciones versionadas.
- OpenAPI/Swagger generado desde NestJS.
- Argon2id como primera opción para passwords.

## Fuentes principales

- [React versions](https://react.dev/versions) y [sunsetting Create React App](https://react.dev/blog/2025/02/14/sunsetting-create-react-app).
- [NestJS authentication](https://docs.nestjs.com/security/authentication), [authorization](https://docs.nestjs.com/security/authorization), [validation](https://docs.nestjs.com/techniques/validation), [configuration](https://docs.nestjs.com/techniques/configuration), [OpenAPI](https://docs.nestjs.com/openapi/introduction), [rate limiting](https://docs.nestjs.com/security/rate-limiting) y [migration guide](https://docs.nestjs.com/migration-guide).
- [Prisma transactions](https://www.prisma.io/docs/orm/prisma-client/queries/transactions) y [migration workflow](https://www.prisma.io/docs/orm/prisma-migrate/workflows/development-and-production).
- [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html) e [indexes](https://www.postgresql.org/docs/current/indexes.html).
- [OWASP REST Security](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html), [Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) y [API Security Top 10](https://owasp.org/API-Security/editions/2023/en/0x11-t10/).
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [WAI-ARIA APG](https://www.w3.org/WAI/ARIA/apg/) y [WAI Forms](https://www.w3.org/WAI/tutorials/forms/).

## Patrones técnicos permitidos

- `APP_GUARD` para autenticación segura por defecto y rutas públicas explícitas.
- `JwtModule.registerAsync`, `JwtService.signAsync` y `verifyAsync`.
- `@Roles`, `RolesGuard` y autorización adicional por objeto dentro del caso de uso.
- `ValidationPipe` con `whitelist`, `forbidNonWhitelisted` y `transform`.
- `ConfigModule.forRoot` con validación que impide arrancar ante configuración inválida.
- `SwaggerModule`, `DocumentBuilder` y bearer auth documentado.
- `ThrottlerModule`, `ThrottlerGuard` y límite específico de login.
- Prisma `$transaction` para cambio de tarea más historial.
- `prisma migrate dev` solo en desarrollo y `prisma migrate deploy` en CI/producción.
- PK, FK, `NOT NULL`, `UNIQUE`, `CHECK` e índices justificados por consultas.
- HTML nativo, foco gestionado con moderación y mensajes de estado accesibles.
- Botón permanente `Move to…` como alternativa contractual al drag-and-drop.

## Requisitos derivados

- Comprobar que el usuario sigue activo en cada petición autenticada.
- Autorizar cada objeto solicitado por ID para evitar BOLA.
- No aceptar propiedades de dominio completas desde el body.
- Fijar algoritmo JWT y validar `iss`, `aud`, `exp` y firma.
- No almacenar tokens en `localStorage` o `sessionStorage`; el ADR de autenticación definirá la alternativa.
- Limitar tamaño de body, longitudes, paginación y frecuencia.
- Mantener transacciones cortas y sin llamadas de red.
- Representar estado, prioridad y error con texto, no solo color.
- Mantener funcionalidad a 320 CSS px y 400% zoom.
- Contraste 4.5:1 en texto normal y 3:1 en texto grande y controles significativos.
- Objetivo interno de 44 × 44 CSS px para acciones táctiles principales.
- Login compatible con pegado, autocompletado y gestores de contraseñas.

## Antipatrones prohibidos

- Auth opt-in endpoint por endpoint.
- Confiar en controles ocultos del frontend o IDs impredecibles como autorización.
- Reutilizar modelos Prisma como DTO o permitir mass assignment.
- Secretos hardcoded, passwords planas o tokens persistidos en almacenamiento web.
- `db push`, `migrate reset` o `migrate dev` en producción.
- Historial escrito fuera de la transacción de negocio.
- Suponer que una FK crea automáticamente un índice local.
- Filtros query anidados dependientes del parser antiguo de Express.
- Wildcards o parámetros opcionales incompatibles con Express 5.
- Drag-and-drop como único mecanismo.
- `aria-grabbed` y `aria-dropeffect`, ambos deprecados.
- `div` clicables, placeholders como labels o acciones solo visibles en hover.
- Declarar `role="grid"` sin implementar por completo su modelo de teclado.
- Marcar un drawer no modal como `aria-modal="true"`.

## Verificación exigida en planes posteriores

Cada fase de implementación deberá incluir:

1. Versión exacta de la documentación consultada.
2. Sección o ejemplo oficial que se seguirá.
3. Checklist de verificación funcional y automatizada.
4. Búsqueda explícita de antipatrones aplicables.
5. Evidencia de pruebas, no solo presencia de código.

