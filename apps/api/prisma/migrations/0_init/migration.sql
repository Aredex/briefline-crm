-- 0_init — Briefline CRM initial schema (PH-03 DB-003)
-- ---------------------------------------------------------------------------
-- Hand-written initial migration. Generated-style layout matching Prisma 7.9.1
-- conventions (constraint/index naming, CREATE TYPE enums) so future
-- `prisma migrate dev` runs do not detect drift.
--
-- DB-004 note: every index below cites the query it serves. Prisma does not
-- auto-index foreign keys (AP-07) — FK-referencing indexes are explicit.
-- Row-local CHECK constraints are added manually at the end (Prisma schema
-- cannot express CHECKs; data-model.md §4.1).

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('BACKLOG', 'PENDING', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TaskChangeEvent" AS ENUM ('CREATED', 'TITLE_CHANGED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'ASSIGNEE_CHANGED', 'DUE_DATE_CHANGED', 'ARCHIVED', 'REOPENED');

-- CreateTable
-- User — ADR-002: email column stores ONLY the normalized value
-- (trim().toLowerCase()); the unique index below enforces case-insensitive
-- uniqueness at the row level (BR-002, DB-007 direct-write proof).
CREATE TABLE "User" (
    "id" uuid NOT NULL,
    "email" varchar(254) NOT NULL,
    "name" varchar(100) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER'::"UserRole",
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE'::"UserStatus",
    "passwordHash" varchar(255) NOT NULL,
    "lastLoginAt" timestamptz(6),
    "createdAt" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamptz(6) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- Client — creator trail protected (Client_createdById_fkey is Restrict, D-6).
CREATE TABLE "Client" (
    "id" uuid NOT NULL,
    "companyName" varchar(160) NOT NULL,
    "industry" varchar(80),
    "contactName" varchar(100) NOT NULL,
    "contactEmail" varchar(254) NOT NULL,
    "phone" varchar(32),
    "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE'::"ClientStatus",
    "notes" varchar(2000),
    "createdById" uuid NOT NULL,
    "createdAt" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamptz(6) NOT NULL,
    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- Task — ADR-003: dueDate is date-only (no time, no timezone); technical
-- timestamps are timestamptz(6) UTC. ADR-004: version >= 1 (CHECK added below).
-- assigneeId is the ONLY nullable/reassignable FK (SetNull backstop, D-6).
CREATE TABLE "Task" (
    "id" uuid NOT NULL,
    "title" varchar(160) NOT NULL,
    "description" varchar(5000),
    "status" "TaskStatus" NOT NULL DEFAULT 'BACKLOG'::"TaskStatus",
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM'::"TaskPriority",
    "assigneeId" uuid,
    "clientId" uuid,
    "dueDate" date,
    "blockedReason" varchar(500),
    "creatorId" uuid NOT NULL,
    "version" integer NOT NULL DEFAULT 1,
    "archivedAt" timestamptz(6),
    "archivedById" uuid,
    "createdAt" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamptz(6) NOT NULL,
    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- TaskChange — append-only history (BR-017/018); taskId FK is Restrict so no
-- cascade ever erases history (PH-03 guard, D-6). oldValue/newValue are
-- JSON.stringify-serialized (D-7); NULL when the field does not apply (CREATED).
CREATE TABLE "TaskChange" (
    "id" uuid NOT NULL,
    "taskId" uuid NOT NULL,
    "actorId" uuid NOT NULL,
    "event" "TaskChangeEvent" NOT NULL,
    "field" varchar(50),
    "oldValue" varchar(2000),
    "newValue" varchar(2000),
    "createdAt" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskChange_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
-- All FKs: onUpdate Cascade (uuid id never changes) — explicit per DATA-001.
ALTER TABLE "Client" ADD CONSTRAINT "Client_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskChange" ADD CONSTRAINT "TaskChange_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskChange" ADD CONSTRAINT "TaskChange_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
-- DB-004: Task board slice + DEC-035 sort (priority DESC, dueDate ASC NULLS
-- LAST, updatedAt DESC). Serves the board query `WHERE status = ? ...` and the
-- dashboard KPI aggregation (FR-TASK-001, FR-DASH-001). Mixed-direction sort
-- needs a residual sort at demo scale (D-14).
CREATE INDEX "Task_status_priority_dueDate_updatedAt_idx" ON "Task"("status", "priority", "dueDate", "updatedAt");

-- CreateIndex
-- DB-004: My Tasks `WHERE assigneeId = ? AND archivedAt IS NULL`
-- (FR-DASH-002); reassignment impact (FR-USR-005); FK integrity (AP-07).
CREATE INDEX "Task_assigneeId_idx" ON "Task"("assigneeId");

-- CreateIndex
-- DB-004: creator-scope lookups (BR-013); FK integrity (AP-07).
CREATE INDEX "Task_creatorId_idx" ON "Task"("creatorId");

-- CreateIndex
-- DB-004: client detail related tasks `WHERE clientId = ?` (FR-CLI-005);
-- FK integrity (AP-07).
CREATE INDEX "Task_clientId_idx" ON "Task"("clientId");

-- CreateIndex
-- DB-004: admin archived view `WHERE archivedAt IS NOT NULL`
-- (FR-TASK-011, BR-016).
CREATE INDEX "Task_archivedAt_idx" ON "Task"("archivedAt");

-- CreateIndex
-- DB-004: FK integrity only (no MVP query filters by archivedById).
CREATE INDEX "Task_archivedById_idx" ON "Task"("archivedById");

-- CreateIndex
-- DB-004: history timeline `WHERE taskId = ? ORDER BY createdAt`
-- (FR-HIST-001/003); composite covers the taskId FK (AP-07).
CREATE INDEX "TaskChange_taskId_createdAt_idx" ON "TaskChange"("taskId", "createdAt");

-- CreateIndex
-- DB-004: FK integrity (no MVP query); future actor-scope audit.
CREATE INDEX "TaskChange_actorId_idx" ON "TaskChange"("actorId");

-- CreateIndex
-- DB-004: client list status filter (FR-CLI-001).
CREATE INDEX "Client_status_idx" ON "Client"("status");

-- CreateIndex
-- DB-004: client search anchor (FR-CLI-001; ILIKE %q% caveat, D-15 — kept for
-- exact-name lookups and as the search/order anchor at demo scale).
CREATE INDEX "Client_companyName_idx" ON "Client"("companyName");

-- CreateIndex
-- DB-004: FK integrity only (no MVP query filters by createdById).
CREATE INDEX "Client_createdById_idx" ON "Client"("createdById");

-- CreateIndex
-- ADR-002/BR-002: unique on the NORMALIZED email value — the stored value IS
-- normalized (trim().toLowerCase(), ADR-002), so case-variant duplicates are
-- rejected at the row level (proven by DB-007 direct INSERT).
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- ---------------------------------------------------------------------------
-- Row-local CHECK constraints (data-model.md §4.1, PH-03 DB-003)
-- Prisma schema cannot express CHECKs — these are added by hand to the initial
-- migration. They make direct writes that bypass the API fail (DB-007).
-- ---------------------------------------------------------------------------

-- ADR-004: version is a positive integer, default 1, incremented per mutation.
ALTER TABLE "Task" ADD CONSTRAINT "Task_version_positive"
  CHECK ("version" >= 1);

-- BR-010: a BLOCKED task must carry a non-empty blocked reason (row-local,
-- provable by direct INSERT — DB-007).
ALTER TABLE "Task" ADD CONSTRAINT "Task_blocked_reason_required"
  CHECK ("status" <> 'BLOCKED' OR ("blockedReason" IS NOT NULL AND btrim("blockedReason") <> ''));

-- BR-011: outside BLOCKED the live reason must be NULL; the old value remains
-- only in TaskChange history (DB-007 direct-write proof).
ALTER TABLE "Task" ADD CONSTRAINT "Task_blocked_reason_cleared"
  CHECK ("status" = 'BLOCKED' OR "blockedReason" IS NULL);
