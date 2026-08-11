// Client response shapes — CLI-API-001..005 (PH-05).
//
// The API NEVER exposes the Prisma Client model directly — every response goes
// through the mapper (clients.mapper.ts) into these envelopes. The Prisma
// model carries `createdById`; the API exposes the resolved `createdBy`
// { id, name } user reference instead.
import type { ClientStatus } from '../../../../../../packages/api-contract/src/generated/prisma/client'
import type { TaskSummary } from '../../users/dto/deactivation-impact.dto'
import type { ContactResponse } from '../../contacts/dto/contact-response.dto'

export interface UserRef {
  id: string
  name: string
}

export interface ClientResponse {
  id: string
  companyName: string
  industry: string | null
  contactName: string
  contactEmail: string
  phone: string | null
  notes: string | null
  status: ClientStatus
  createdBy: UserRef
  createdAt: Date
  updatedAt: Date
}

export interface PageMeta {
  page: number
  limit: number
  total: number
}

/** GET /clients/:id — client plus its paginated related-task summary (FR-CLI-005)
 *  and its contact list, primary first (PC-01, PH-14). */
export interface ClientWithTasksResponse {
  client: ClientResponse
  relatedTasks: { data: TaskSummary[]; meta: PageMeta }
  contacts: ContactResponse[]
}

export type { TaskSummary }
