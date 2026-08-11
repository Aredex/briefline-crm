-- CreateTable
CREATE TABLE "labels" (
    "id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "color" VARCHAR(7) NOT NULL DEFAULT '#6b7280',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_labels" (
    "taskId" UUID NOT NULL,
    "labelId" UUID NOT NULL,

    CONSTRAINT "task_labels_pkey" PRIMARY KEY ("taskId","labelId")
);

-- CreateIndex
CREATE UNIQUE INDEX "labels_name_key" ON "labels"("name");

-- CreateIndex
CREATE INDEX "task_labels_labelId_idx" ON "task_labels"("labelId");

-- AddForeignKey
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
