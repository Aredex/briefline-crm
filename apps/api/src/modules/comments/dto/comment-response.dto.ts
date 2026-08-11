// Comment response shapes — COMM-001 (PC-03).
//
// The API NEVER exposes the Prisma Comment model directly — every response
// goes through the mapper (comments.mapper.ts). The Prisma model carries the
// raw authorId FK; the API exposes the resolved `author` { id, name } user ref
// instead (same rule as tasks' actor/creator refs).
export interface UserRef {
  id: string
  name: string
}

export interface PageMeta {
  page: number
  limit: number
  total: number
}

/** Full comment representation (thread list, COMM-001). */
export interface CommentResponse {
  id: string
  taskId: string
  content: string
  author: UserRef
  createdAt: Date
}

/** Compact comment embedded in the task detail (last 5) — PC-03. */
export interface TaskComment {
  id: string
  content: string
  author: UserRef
  createdAt: Date
}
