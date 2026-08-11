// Label -> API response mapper — LAB-001/002 (PC-04).
//
// The single place where a Prisma Label row becomes the API contract: the
// catalog list/create/update/delete responses AND the { id, name, color }
// refs embedded in task payloads all come from here — never the raw model.
import type { Label } from '../../../../../packages/api-contract/src/generated/prisma/client'
import type { LabelResponse, TaskLabelRef } from './dto/label-response.dto'

export function toLabelResponse(label: Label): LabelResponse {
  return {
    id: label.id,
    name: label.name,
    color: label.color,
    createdAt: label.createdAt,
  }
}

/** Compact ref embedded in task payloads (LAB-002). */
export function toTaskLabelRef(label: { id: string; name: string; color: string }): TaskLabelRef {
  return { id: label.id, name: label.name, color: label.color }
}
