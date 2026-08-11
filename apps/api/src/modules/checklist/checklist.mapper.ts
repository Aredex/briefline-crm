// ChecklistItem -> API response mapper — CHECK-001/002 (PC-05).
//
// The single place where a Prisma ChecklistItem row becomes the API contract:
// list/create/update/delete/reorder responses all come from here — never the
// raw model.
import type { ChecklistItem } from '../../../../../packages/api-contract/src/generated/prisma/client'
import type { ChecklistItemResponse } from './dto/checklist-item-response.dto'

export function toChecklistItemResponse(item: ChecklistItem): ChecklistItemResponse {
  return {
    id: item.id,
    taskId: item.taskId,
    content: item.content,
    completed: item.completed,
    sortOrder: item.sortOrder,
    version: item.version,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}
