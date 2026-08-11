-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "firstName" VARCHAR(100) NOT NULL,
    "lastName" VARCHAR(100) NOT NULL,
    "email" VARCHAR(254),
    "phone" VARCHAR(32),
    "role" VARCHAR(80),
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contacts_clientId_idx" ON "contacts"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_clientId_email_key" ON "contacts"("clientId", "email");

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Row-level invariants (data-model.md §4.1 pattern — Prisma schema cannot
-- express partial unique indexes; added by hand, same as 0_init CHECKs).
-- ---------------------------------------------------------------------------

-- CONT-001: at most ONE primary contact per client. Postgres partial unique
-- index: a NULL-free boolean filter means at most one row per clientId can
-- satisfy WHERE isPrimary — provable by direct INSERT (DB-007 pattern).
CREATE UNIQUE INDEX "contacts_single_primary_per_client" ON "contacts"("clientId") WHERE "isPrimary";
