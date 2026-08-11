// Checklist item response shape — CHECK-001/002 (PC-05).
//
// The API NEVER exposes the Prisma ChecklistItem model directly — every
// response goes through the mapper (checklist.mapper.ts). `version` is the
// optimistic lock the client echoes back on toggle/content updates
// (ADR-004 pattern, same as Task.version).
export interface ChecklistItemResponse {
  id: string
  taskId: string
  content: string
  completed: boolean
  sortOrder: number
  version: number
  createdAt: Date
  updatedAt: Date
}
