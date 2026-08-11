// Label response shapes — LAB-001/002 (PC-04).
//
// The API NEVER exposes the Prisma Label model directly — every response goes
// through the mapper (labels.mapper.ts). The catalogue returns the full
// LabelResponse; tasks embed the compact TaskLabelRef ({ id, name, color }) in
// their summary/detail payloads (LAB-002).
export interface LabelResponse {
  id: string
  name: string
  color: string
  createdAt: Date
}

/** Compact label ref embedded in TaskSummary/TaskResponse (LAB-002). */
export interface TaskLabelRef {
  id: string
  name: string
  color: string
}
