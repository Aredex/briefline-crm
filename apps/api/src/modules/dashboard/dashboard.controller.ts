// Dashboard controller — TASK-API-011 (PH-06, FR-DASH-001..003).
//
// Routes (global prefix /api + URI versioning v1):
//   GET /api/v1/dashboard/kpis             -> team-wide counts (both roles)
//   GET /api/v1/dashboard/my-tasks         -> assigned tasks (prioritized)
//   GET /api/v1/dashboard/recent-activity  -> bounded feed, newest first
//
// All three are authenticated team-wide reads — no @Roles needed (matrix rows
// 29-31): members get the same KPI numbers, their own task list, and an
// activity feed filtered to active tasks (DASH-003 guard lives in the service).
import { Controller, Get, HttpCode, HttpStatus, Query } from '@nestjs/common'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import type { AuthUser } from '../auth/auth.types'
import { DashboardService } from './dashboard.service'
import { TaskQueryDto } from '../tasks/dto/task-query.dto'
import type {
  DashboardKpisResponse,
  DashboardMyTasksResponse,
  DashboardRecentActivityResponse,
} from './dto/dashboard.dto'

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('kpis')
  @HttpCode(HttpStatus.OK)
  async kpis(): Promise<DashboardKpisResponse> {
    return { data: await this.dashboardService.kpis() }
  }

  @Get('my-tasks')
  @HttpCode(HttpStatus.OK)
  async myTasks(@Query() query: TaskQueryDto, @CurrentUser() user: AuthUser): Promise<DashboardMyTasksResponse> {
    return this.dashboardService.myTasks(query, user)
  }

  @Get('recent-activity')
  @HttpCode(HttpStatus.OK)
  async recentActivity(
    @Query() query: TaskQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DashboardRecentActivityResponse> {
    return this.dashboardService.recentActivity(query, user)
  }
}
