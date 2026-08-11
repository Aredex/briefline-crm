# Project Brief — Briefline CRM

**Estado:** Aprobado v1  
**Fecha:** 2026-08-11  
**Tipo:** Caso de estudio de portafolio  
**Inspiración:** Necesidad observada en una oferta freelance; no corresponde a un cliente real.

## 1. Resumen

Diseñar una herramienta interna moderna para que una pequeña agencia o equipo comercial pueda organizar trabajo relacionado con clientes, asignar responsables, gestionar prioridades y estados, y consultar un historial fiable de cambios.

Briefline CRM conecta los clientes y sus contactos con el trabajo que una pequeña agencia debe ejecutar. Su núcleo es la coordinación operativa mediante tareas, sin intentar reproducir un CRM comercial de ventas, facturación o marketing.

## 2. Audiencia del caso de estudio

- Clientes freelance y reclutadores técnicos.
- Empresas que buscan un perfil full-stack con fortaleza frontend.

## 3. Capacidades que debe demostrar

- Diseño de una interfaz React moderna, sobria y accesible.
- Diseño e implementación posterior de una API REST modular.
- Modelado relacional con PostgreSQL y Prisma.
- Autenticación y autorización aplicada en servidor.
- Flujos de trabajo mediante tablero y arrastrar y soltar.
- Auditoría básica y consistencia transaccional.
- Estrategia de pruebas proporcionada al riesgo.
- Documentación técnica, despliegue público y presentación del caso de estudio.

## 4. Roles confirmados

### Administrator

- Ver todas las tareas.
- Crear y editar cualquier tarea.
- Asignar responsables.
- Archivar tareas.
- Ver todo el historial de cambios.
- Crear, editar, activar y desactivar miembros desde una pantalla de usuarios.

### Member

- Ver todas las tareas del equipo.
- Crear tareas.
- Editar tareas creadas por el miembro o asignadas a este.
- Cambiar el estado de las tareas que puede editar.
- Consultar el historial de las tareas visibles.
- No administrar usuarios.
- No eliminar información definitivamente.

La matriz detallada de permisos y los casos límite se definirán en el PRD.

## 5. Funcionalidad confirmada

### Clientes y contactos

- El MVP incluirá clientes con empresa, industria, contacto principal, estado y notas.
- Las tareas podrán relacionarse opcionalmente con un cliente.
- Todos los usuarios podrán consultar clientes.
- Los miembros podrán crear clientes.
- Solo los administradores podrán modificar datos sensibles, desactivar o archivar clientes.
- La versión Portfolio Complete separará los contactos en una entidad propia y permitirá varios contactos por cliente.

### Tareas

Campos mínimos:

- Título.
- Descripción.
- Estado.
- Prioridad.
- Responsable.
- Fecha límite.
- Creador.
- Fecha de creación.
- Fecha de última actualización.

Estados confirmados:

- Backlog.
- Pending.
- In progress.
- Blocked.
- Completed.

Prioridades confirmadas:

- Low.
- Medium.
- High.
- Urgent.

### Tablero

- Backlog separado visualmente del flujo activo.
- Columnas para estados activos.
- Cambio de estado mediante arrastrar y soltar.
- Alternativa accesible mediante controles de teclado/formulario.
- Filtros por estado, prioridad, responsable y vencimiento.
- Búsqueda textual.
- Un único responsable por tarea.
- Las tareas de backlog podrán existir sin responsable ni fecha límite.
- Pasar una tarea desde backlog al flujo activo exigirá responsable.
- El motivo de bloqueo será obligatorio mientras una tarea esté bloqueada.
- Se permitirán transiciones libres entre estados para las tareas editables.
- Una tarea completada podrá reabrirse, registrando el cambio.

### Historial

Registro append-only para:

- Creación.
- Cambio de título.
- Cambio de estado.
- Cambio de prioridad.
- Cambio de responsable.
- Cambio de fecha límite.
- Archivado.

Cada entrada deberá identificar actor, instante, campo modificado, valor anterior y valor nuevo cuando corresponda.

### Usuarios

- Pantalla de administración de usuarios con calidad visual equivalente al tablero.
- Creación, edición, activación y desactivación por administradores.
- No se permitirá registro público en la primera versión.
- No se podrá desactivar ni degradar al último administrador activo.
- Un usuario desactivado conservará autoría e historial, no podrá iniciar sesión ni recibir nuevas asignaciones.

## 6. Autenticación y demostración

- Inicio de sesión mediante correo y contraseña.
- Access token JWT sin refresh token en el MVP.
- Credenciales públicas separadas para Administrator y Member.
- Datos completamente ficticios.
- Reinicio periódico del entorno de demostración.
- Ningún dato personal real.

## 7. Idiomas

- Interfaz, contenido demo, API, repositorio y README en inglés.
- Documentación de planificación disponible también en español.
- La aplicación no será bilingüe en el alcance inicial.

## 8. Dirección técnica preliminar

- Frontend: React, TypeScript y Vite.
- Backend: NestJS con API REST versionada.
- Persistencia: PostgreSQL con Prisma.
- Autorización: RBAC con `ADMIN` y `MEMBER`.
- Contrato: OpenAPI/Swagger.
- Ejecución local: PostgreSQL mediante Docker Compose; estrategia final pendiente del diseño operativo.
- Despliegue: proveedor gratuito o de bajo coste.
- Accesibilidad objetivo: WCAG 2.2 AA para los flujos principales.

Estas elecciones deberán quedar justificadas mediante ADR antes de la implementación.

## 8.1 Navegación y experiencia confirmadas

- Dashboard.
- Tasks, con Board como vista principal.
- Clients.
- Users, visible solo para administradores.
- Profile.
- Logout.
- Panel lateral de tarea con detalle, edición e historial.
- Interfaz clara como tema único del MVP.
- Experiencia completa en escritorio, funcional en tablet y vista de lista adaptada en móvil.

## 9. Calidad prevista

- Pruebas unitarias de reglas de dominio y permisos críticos.
- Pruebas de integración de la API y persistencia.
- Dos o tres recorridos end-to-end representativos.
- Verificación manual responsive, accesibilidad básica y estados de error.

## 10. Estrategia de alcance

El producto se especificará como una solución completa dividida en entregas.

### Portfolio MVP

Objetivo de referencia: 12–20 horas, documentando explícitamente los compromisos necesarios para ajustarse a esa ventana.

Incluye clientes básicos, tablero, administración de usuarios, dashboard compacto, autenticación, permisos, historial y demo pública.

### Portfolio Complete

Versión ampliada y pulida con estimación profesional propia. Añadirá contactos como entidad, vista de lista, comentarios, etiquetas y checklist. Solo incluirá capacidades que refuercen la historia del producto y las competencias demostradas.

### Future roadmap

Capacidades valiosas pero no necesarias para el primer caso de estudio.

## 11. Exclusiones iniciales del MVP

- Registro público.
- Recuperación de contraseña.
- Refresh tokens.
- Colaboración en tiempo real.
- Notificaciones por correo o push.
- Archivos adjuntos.
- Espacios de trabajo múltiples.
- Estados configurables.
- Integraciones externas.
- Notificaciones, menciones y actualizaciones en tiempo real.
- Subtareas jerárquicas.
- Eliminación física de tareas o registros auditables.

Estas exclusiones pueden pasar a Portfolio Complete o Future roadmap después del PRD.

## 12. Criterios iniciales de éxito

- Un evaluador puede acceder a la demo sin configuración ni registro.
- Los dos roles muestran diferencias de permisos observables y verificables.
- El flujo crear-asignar-mover-filtrar-consultar historial funciona de extremo a extremo.
- El tablero sigue siendo comprensible con un conjunto demo realista.
- La API y el modelo de datos comunican decisiones profesionales.
- El repositorio permite comprender producto, arquitectura, instalación, pruebas y compromisos de alcance.

## 13. Asuntos abiertos

- Reglas completas de edición y transición.
- Diseño de archivado y retención.
- Estrategia de datos demo y reinicio.
- Proveedor de despliegue.
- Estimaciones separadas para MVP y versión completa.
- Validación legal y de dominio del nombre si alguna vez deja de ser un caso de estudio.

Estos asuntos serán resueltos por Product & Architecture aplicando la alternativa recomendada y registrando la decisión. No requieren aprobación individual del propietario del portafolio.
