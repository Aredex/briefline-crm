// Labels module — LAB-001/002 (PC-04).
//
// Standalone module: LabelsService only needs PrismaService (global) and the
// pure predicates from tasks.policy (imported, not a module dependency) — no
// cross-module imports, no circularity.
import { Module } from '@nestjs/common'
import { LabelsController } from './labels.controller'
import { LabelsService } from './labels.service'

@Module({
  controllers: [LabelsController],
  providers: [LabelsService],
})
export class LabelsModule {}
