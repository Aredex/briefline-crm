/*
 * Unit tests for the optimistic task mutation hooks (src/hooks/useTaskMutations.ts,
 * TASK-FE-012/013).
 *
 * Renders each hook with a fresh QueryClient (retry off) against a mocked
 * `api` module, seeding the query cache with a board (and detail) first. The
 * tests pin the observable cache contract: optimistic moves respect the
 * contractual sort (priority desc, due asc, nulls last), rollback restores the
 * exact snapshot on error, and the per-task monotonic request id drops
 * out-of-order responses (TASK-FE-013).
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { api } from '../src/api/client'
import {
  useChangeTaskStatus,
  useUpdateTask,
} from '../src/hooks/useTaskMutations'
import type { BoardResponse, TaskResponse, TaskSummary } from '../src/api/types'

vi.mock('../src/api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

const TASK_ID = 'task-1'

function summary(overrides: Partial<TaskSummary> = {}): TaskSummary {
  return {
    id: TASK_ID,
    title: 'Ship the onboarding flow',
    status: 'PENDING',
    priority: 'MEDIUM',
    assignee: null,
    client: null,
    dueDate: null,
    version: 1,
    updatedAt: '2026-08-01T10:00:00.000Z',
    ...overrides,
  }
}

function board(overrides: Partial<BoardResponse> = {}): BoardResponse {
  return {
    backlog: [],
    columns: { PENDING: [], IN_PROGRESS: [], BLOCKED: [], COMPLETED: [] },
    meta: { total: 0 },
    ...overrides,
  }
}

function taskResponse(overrides: Partial<TaskResponse> = {}): TaskResponse {
  return {
    id: TASK_ID,
    title: 'Ship the onboarding flow',
    description: null,
    status: 'PENDING',
    priority: 'MEDIUM',
    assignee: null,
    client: null,
    dueDate: null,
    blockedReason: null,
    creator: { id: 'creator-1', name: 'Ada Lovelace' },
    version: 1,
    archivedAt: null,
    archivedBy: null,
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    ...overrides,
  }
}

let queryClient: QueryClient
let wrapper: (props: { children: ReactNode }) => ReactNode

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  wrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  vi.mocked(api.patch).mockReset()
  vi.mocked(api.post).mockReset()
})

function seedBoard(data: BoardResponse) {
  queryClient.setQueryData<BoardResponse>(['tasks', 'board'], data)
}

function boardData(): BoardResponse {
  return queryClient.getQueryData<BoardResponse>(['tasks', 'board'])!
}

describe('useChangeTaskStatus — optimistic status move', () => {
  it('moves the card optimistically and inserts it respecting the priority sort', async () => {
    const urgent = summary({ id: 'task-urgent', title: 'U', priority: 'URGENT', status: 'BACKLOG' })
    const medium = summary({
      id: 'task-medium',
      title: 'M',
      priority: 'MEDIUM',
      status: 'IN_PROGRESS',
      dueDate: '2026-08-15',
      version: 2,
    })
    seedBoard(
      board({
        backlog: [urgent],
        columns: { ...board().columns, IN_PROGRESS: [medium] },
        meta: { total: 2 },
      }),
    )
    vi.mocked(api.patch).mockResolvedValue(taskResponse({ status: 'IN_PROGRESS', version: 2 }))

    const { result } = renderHook(() => useChangeTaskStatus(), { wrapper })
    act(() => {
      result.current.mutate({ taskId: 'task-urgent', payload: { status: 'IN_PROGRESS', expectedVersion: 1 } })
    })

    // Optimistic state is applied before the request settles. onMutate is
    // async (cancelQueries), so the cache updates on a later microtask flush.
    await waitFor(() => {
      const moved = boardData()
      expect(moved.backlog).toHaveLength(0)
      expect(moved.columns.IN_PROGRESS.map((t) => t.id)).toEqual(['task-urgent', 'task-medium'])
      expect(moved.columns.IN_PROGRESS[0]!.version).toBe(2)
    })

    await waitFor(() =>
      expect(vi.mocked(api.patch)).toHaveBeenCalledWith('/tasks/task-urgent/status', {
        status: 'IN_PROGRESS',
        expectedVersion: 1,
      }),
    )
  })

  it('restores the board and detail snapshots when the request fails', async () => {
    seedBoard(board({ columns: { ...board().columns, PENDING: [summary()] }, meta: { total: 1 } }))
    queryClient.setQueryData<TaskResponse>(['tasks', 'detail', TASK_ID], taskResponse())
    vi.mocked(api.patch).mockRejectedValue(new Error('network down'))

    const { result } = renderHook(() => useChangeTaskStatus(), { wrapper })
    act(() => {
      result.current.mutate({ taskId: TASK_ID, payload: { status: 'IN_PROGRESS', expectedVersion: 1 } })
    })
    // Optimistic move applied, then rolled back on error.
    await waitFor(() => {
      const data = boardData()
      expect(data.columns.PENDING.map((t) => t.id)).toEqual([TASK_ID])
      expect(data.columns.IN_PROGRESS).toHaveLength(0)
    })
    expect(boardData().columns.PENDING[0]!.version).toBe(1)
    expect(queryClient.getQueryData<TaskResponse>(['tasks', 'detail', TASK_ID])?.version).toBe(1)
  })

  it('ignores the failure of an out-of-order response (monotonic request id, TASK-FE-013)', async () => {
    // A goes first but settles LAST and fails; B settles first and wins.
    seedBoard(board({ columns: { ...board().columns, PENDING: [summary()] }, meta: { total: 1 } }))

    let rejectA!: (error: Error) => void
    vi.mocked(api.patch).mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectA = reject
        }),
    )
    vi.mocked(api.patch).mockResolvedValueOnce(taskResponse({ status: 'BLOCKED', version: 3 }))

    const { result } = renderHook(() => useChangeTaskStatus(), { wrapper })
    act(() => {
      result.current.mutate({ taskId: TASK_ID, payload: { status: 'IN_PROGRESS', expectedVersion: 1 } })
    })
    await waitFor(() => expect(vi.mocked(api.patch)).toHaveBeenCalledTimes(1))

    act(() => {
      result.current.mutate({
        taskId: TASK_ID,
        payload: { status: 'BLOCKED', blockedReason: 'Waiting on vendor', expectedVersion: 2 },
      })
    })
    // B settles first — its optimistic state (version 3) must survive A's late failure.
    await waitFor(() => {
      const data = boardData()
      expect(data.columns.BLOCKED.map((t) => t.id)).toEqual([TASK_ID])
      expect(data.columns.BLOCKED[0]!.version).toBe(3)
    })

    await act(async () => {
      rejectA(new Error('stale failure'))
    })

    const after = boardData()
    expect(after.columns.BLOCKED.map((t) => t.id)).toEqual([TASK_ID])
    expect(after.columns.BLOCKED[0]!.version).toBe(3)
    expect(after.columns.PENDING).toHaveLength(0)
  })
})

describe('useChangeTaskStatus — board ordering contract', () => {
  it('sorts by priority desc, then due date asc with nulls last', async () => {
    const due15 = summary({
      id: 'due-15',
      title: 'D15',
      status: 'IN_PROGRESS',
      dueDate: '2026-08-15',
      version: 2,
    })
    const dueNull = summary({ id: 'due-null', title: 'DN', status: 'IN_PROGRESS', dueDate: null, version: 2 })
    const due10 = summary({ id: 'due-10', title: 'D10', status: 'PENDING', dueDate: '2026-08-10', version: 1 })
    seedBoard(
      board({
        columns: { ...board().columns, IN_PROGRESS: [due15, dueNull], PENDING: [due10] },
        meta: { total: 3 },
      }),
    )
    vi.mocked(api.patch).mockResolvedValue(taskResponse({ status: 'IN_PROGRESS' }))

    const { result } = renderHook(() => useChangeTaskStatus(), { wrapper })
    act(() => {
      result.current.mutate({ taskId: 'due-10', payload: { status: 'IN_PROGRESS', expectedVersion: 1 } })
    })

    await waitFor(() => {
      expect(boardData().columns.IN_PROGRESS.map((t) => t.id)).toEqual(['due-10', 'due-15', 'due-null'])
    })
  })
})

describe('useUpdateTask — optimistic field patch', () => {
  it('patches title/priority/refs optimistically in board and detail, bumping version', async () => {
    seedBoard(board({ columns: { ...board().columns, PENDING: [summary()] }, meta: { total: 1 } }))
    queryClient.setQueryData<TaskResponse>(['tasks', 'detail', TASK_ID], taskResponse())
    vi.mocked(api.patch).mockResolvedValue(
      taskResponse({ title: 'Renamed task', priority: 'URGENT', assignee: null, version: 2 }),
    )

    const { result } = renderHook(() => useUpdateTask(), { wrapper })
    act(() => {
      result.current.mutate({
        taskId: TASK_ID,
        payload: {
          title: 'Renamed task',
          priority: 'URGENT',
          assigneeId: null,
          expectedVersion: 1,
        },
      })
    })

    await waitFor(() => {
      const moved = boardData().columns.PENDING[0]!
      expect(moved.title).toBe('Renamed task')
      expect(moved.priority).toBe('URGENT')
      expect(moved.assignee).toBeNull()
      expect(moved.version).toBe(2)

      const detail = queryClient.getQueryData<TaskResponse>(['tasks', 'detail', TASK_ID])
      expect(detail?.title).toBe('Renamed task')
      expect(detail?.priority).toBe('URGENT')
      expect(detail?.assignee).toBeNull()
      expect(detail?.version).toBe(2)
    })

    await waitFor(() =>
      expect(vi.mocked(api.patch)).toHaveBeenCalledWith('/tasks/task-1', {
        title: 'Renamed task',
        priority: 'URGENT',
        assigneeId: null,
        expectedVersion: 1,
      }),
    )
  })

  it('uses optimisticRefs for the assignee name when reassigning to a known user', async () => {
    seedBoard(board({ columns: { ...board().columns, PENDING: [summary()] }, meta: { total: 1 } }))
    // The optimistic version bumps from the cached detail (TASK-FE-012) — the
    // real app has TaskDetail mounted, so the detail query is in the cache.
    queryClient.setQueryData<TaskResponse>(['tasks', 'detail', TASK_ID], taskResponse())
    vi.mocked(api.patch).mockResolvedValue(taskResponse({ version: 2 }))

    const { result } = renderHook(() => useUpdateTask(), { wrapper })
    act(() => {
      result.current.mutate({
        taskId: TASK_ID,
        payload: { assigneeId: 'user-2', expectedVersion: 1 },
        optimisticRefs: { assignee: { id: 'user-2', name: 'Grace Hopper' } },
      })
    })

    await waitFor(() => {
      expect(boardData().columns.PENDING[0]!.assignee).toEqual({ id: 'user-2', name: 'Grace Hopper' })
      expect(boardData().columns.PENDING[0]!.version).toBe(2)
    })
  })

  it('restores board and detail on failure', async () => {
    seedBoard(board({ columns: { ...board().columns, PENDING: [summary()] }, meta: { total: 1 } }))
    queryClient.setQueryData<TaskResponse>(['tasks', 'detail', TASK_ID], taskResponse())
    vi.mocked(api.patch).mockRejectedValue(new Error('network down'))

    const { result } = renderHook(() => useUpdateTask(), { wrapper })
    act(() => {
      result.current.mutate({ taskId: TASK_ID, payload: { title: 'X', expectedVersion: 1 } })
    })
    await waitFor(() => expect(vi.mocked(api.patch)).toHaveBeenCalled())

    await waitFor(() => {
      expect(boardData().columns.PENDING[0]!.title).toBe('Ship the onboarding flow')
      expect(boardData().columns.PENDING[0]!.version).toBe(1)
    })
    expect(queryClient.getQueryData<TaskResponse>(['tasks', 'detail', TASK_ID])?.version).toBe(1)
  })
})
