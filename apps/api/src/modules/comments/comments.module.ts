// Comments module — COMM-001 (PC-03).
//
// Standalone module: CommentsService only needs PrismaService (global) and the
// pure predicate canViewTask from tasks.policy (imported, not a module
// dependency) — no cross-module imports, no circularity.
import { Module } from '@nestjs/common'
import { CommentsController } from './comments.controller'
import { CommentsService } from './comments.service'

@Module({
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
