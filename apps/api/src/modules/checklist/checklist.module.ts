// Checklist module — CHECK-001/002 (PC-05).
//
// Standalone module: ChecklistService only needs PrismaService (global) and
// the pure predicates from tasks.policy (imported, not a module dependency) —
// no cross-module imports, no circularity (labels pattern, PC-04).
import { Module } from '@nestjs/common'
import { ChecklistController } from './checklist.controller'
import { ChecklistService } from './checklist.service'

@Module({
  controllers: [ChecklistController],
  providers: [ChecklistService],
})
export class ChecklistModule {}
