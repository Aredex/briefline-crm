// Dashboard service — TASK-API-011 (PH-06, FR-DASH-001..003).
//
//   KPIs            — team-wide counts over ACTIVE tasks only (archived are
//                     excluded, BR-016); both roles see the same numbers
//                     (matrix row 29). Overdue is computed against the
//                     Europe/Madrid calendar date (ADR-003): a task whose due
//                     date has fully ended there counts even if the server's
//                     UTC date is still the previous day.
//   My Tasks        — tasks assigned to the caller, active only, contractual
//                     sort (DASH-002 = DEC-035), offset pagination.
//   Recent activity — TaskChange events newest first (bounded). Members only
//                     see events on ACTIVE tasks — archived-task events are
//                     admin-only, even if the member was the actor
//                     (DASH-003: no hidden-resource activity leak).
import { Injectable } from '@nestjs/common'
import { Prisma } from '../../generated/prisma/client'
import type { AuthUser } from '../auth/auth.types'
import { CustomLogger } from '../../common/logger/custom.logger'
import { PrismaService } from '../../database/prisma.service'
import { toTaskSummary } from '../tasks/tasks.mapper'
import type { TaskQueryDto } from '../tasks/dto/task-query.dto'
import type { PageMeta } from '../tasks/dto/task-response.dto'
import type { ActivityItem, DashboardMyTasksResponse, DashboardRecentActivityResponse, Kpis } from './dto/dashboard.dto'

const DAY = 24 * 3_600_000

// Contractual my-tasks sort (DASH-002 = DEC-035).
const MY_TASKS_SORT: Prisma.TaskOrderByWithRelationInput[] = [
  { priority: 'desc' },
  { dueDate: { sort: 'asc', nulls: 'last' } },
  { updatedAt: 'desc' },
]

/** Current calendar date in Europe/Madrid as a UTC-midnight Date (ADR-003). */
function madridTodayUtcMidnight(): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const year = parts.find((p) => p.type === 'year')?.value ?? '1970'
  const month = parts.find((p) => p.type === 'month')?.value ?? '01'
  const day = parts.find((p) => p.type === 'day')?.value ?? '01'
  return new Date(`${year}-${month}-${day}T00:00:00.000Z`)
}

@Injectable()
export class DashboardService {
  private readonly logger = new CustomLogger('DashboardService')

  constructor(private readonly prisma: PrismaService) {}

  /** FR-DASH-001 — one query round-trip for the four KPI counts (no N+1). */
  async kpis(): Promise<Kpis> {
    const madridToday = madridTodayUtcMidnight()
    const sevenDaysAgo = new Date(Date.now() - 7 * DAY)
    const [open, blocked, overdue, completedLast7Days] = await this.prisma.$transaction(async (tx) => {
      const counts = await Promise.all([
        // Open: PENDING + IN_PROGRESS + BLOCKED, non-archived (data-model §8.5).
        tx.task.count({ where: { archivedAt: null, status: { in: ['PENDING', 'IN_PROGRESS', 'BLOCKED'] } } }),
        tx.task.count({ where: { archivedAt: null, status: 'BLOCKED' } }),
        // Overdue: due date strictly before today in Europe/Madrid (ADR-003).
        tx.task.count({ where: { archivedAt: null, status: { not: 'COMPLETED' }, dueDate: { lt: madridToday } } }),
        tx.task.count({ where: { archivedAt: null, status: 'COMPLETED', updatedAt: { gte: sevenDaysAgo } } }),
      ])
      return counts
    })
    return { open, overdue, blocked, completedLast7Days }
  }

  /** FR-DASH-002 — tasks assigned to the caller, prioritized, paginated. */
  async myTasks(query: TaskQueryDto, actor: AuthUser): Promise<DashboardMyTasksResponse> {
    const where = { assigneeId: actor.id, archivedAt: null }
    const [total, tasks] = await this.prisma.$transaction(async (tx) => {
      const [count, rows] = await Promise.all([
        tx.task.count({ where }),
        tx.task.findMany({
          where,
          include: {
            assignee: { select: { id: true, name: true } },
            client: { select: { id: true, companyName: true } },
            labels: { select: { label: { select: { id: true, name: true, color: true } } } }, // LAB-002 (PC-04)
          },
          orderBy: MY_TASKS_SORT,
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
      ])
      return [count, rows] as const
    })
    const meta: PageMeta = { page: query.page, limit: query.limit, total }
    return { data: tasks.map(toTaskSummary), meta }
  }

  /** FR-DASH-003 — bounded feed, newest first, no archived-task leak for members. */
  async recentActivity(query: TaskQueryDto, actor: AuthUser): Promise<DashboardRecentActivityResponse> {
    const where: Prisma.TaskChangeWhereInput = actor.role === 'ADMIN' ? {} : { task: { archivedAt: null } }
    const [total, changes] = await this.prisma.$transaction(async (tx) => {
      const [count, rows] = await Promise.all([
        tx.taskChange.count({ where }),
        tx.taskChange.findMany({
          where,
          include: {
            task: { select: { id: true, title: true } },
            actor: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
      ])
      return [count, rows] as const
    })
    const data: ActivityItem[] = changes.map((change) => ({
      id: change.id,
      type: change.event,
      taskId: change.task.id,
      taskTitle: change.task.title,
      actorName: change.actor.name,
      occurredAt: change.createdAt,
    }))
    return { data, meta: { page: query.page, limit: query.limit, total } }
  }
}
