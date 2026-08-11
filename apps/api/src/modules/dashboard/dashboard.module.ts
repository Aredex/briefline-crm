// Dashboard module — TASK-API-011 (PH-06).
import { Module } from '@nestjs/common'
import { DashboardController } from './dashboard.controller'
import { DashboardService } from './dashboard.service'

@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
