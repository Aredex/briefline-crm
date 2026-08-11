/*
 * Dashboard (PH-10) — landing page after sign-in. Four KPI cards (DASH-001)
 * that deep-link into the board with the matching filter (DASH-004), plus
 * My Tasks (DASH-002) and Recent activity (DASH-003). Each section owns its
 * own query so a failure in one never hides the others (partial error).
 *
 * Deep links (DASH-004): the board reads flat single-value params
 * (FR-TASK-006, useBoard.ts), so "Open" goes to the unfiltered board (all
 * active columns) and the rest map to the board's supported filters.
 */
import { useKpisQuery } from '../hooks/useDashboardQueries'
import { KpiCard } from '../components/dashboard/KpiCard'
import { MyTasks } from '../components/dashboard/MyTasks'
import { RecentActivity } from '../components/dashboard/RecentActivity'
import { IconAlertTriangle, IconCheckCircle, IconClock, IconInbox } from '../components/ui/icons'
import '../components/dashboard/Dashboard.css'

export function Dashboard() {
  const kpis = useKpisQuery()
  const kpi = (value: number | undefined) => ({
    isLoading: kpis.isPending,
    isError: kpis.isError,
    value,
  })

  return (
    <div className="page">
      {/* div, not <header>: the shell already provides the banner landmark. */}
      <div className="page-header">
        <h1 className="page-header__title">Dashboard</h1>
      </div>

      <div className="kpi-grid">
        <KpiCard
          label="Open tasks"
          href="/tasks"
          icon={<IconInbox />}
          tone="primary"
          {...kpi(kpis.data?.open)}
        />
        <KpiCard
          label="Overdue"
          href="/tasks?due=OVERDUE"
          icon={<IconClock />}
          tone="danger"
          {...kpi(kpis.data?.overdue)}
        />
        <KpiCard
          label="Blocked"
          href="/tasks?status=BLOCKED"
          icon={<IconAlertTriangle />}
          tone="warning"
          {...kpi(kpis.data?.blocked)}
        />
        <KpiCard
          label="Recently completed"
          href="/tasks?status=COMPLETED"
          icon={<IconCheckCircle />}
          tone="success"
          {...kpi(kpis.data?.completedLast7Days)}
        />
      </div>

      <div className="dashboard-sections">
        <MyTasks />
        <RecentActivity />
      </div>
    </div>
  )
}
