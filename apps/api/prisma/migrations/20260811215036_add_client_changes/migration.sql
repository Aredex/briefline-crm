-- CreateTable
CREATE TABLE "client_changes" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "event" VARCHAR(50) NOT NULL,
    "field" VARCHAR(50),
    "oldValue" TEXT,
    "newValue" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_changes_clientId_idx" ON "client_changes"("clientId");

-- CreateIndex
CREATE INDEX "client_changes_actorId_idx" ON "client_changes"("actorId");

-- AddForeignKey
ALTER TABLE "client_changes" ADD CONSTRAINT "client_changes_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_changes" ADD CONSTRAINT "client_changes_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
