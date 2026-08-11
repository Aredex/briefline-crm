// Client -> ClientResponse mapper — CLI-API-001..005 (PH-05).
//
// The single place where the Prisma Client row is shaped into the API contract:
// `createdById` becomes the resolved `createdBy` user ref, and no internal
// columns leak into responses. Every response path MUST go through it.
import type { Client as PrismaClient } from '../../../../../packages/api-contract/src/generated/prisma/client'
import type { ClientResponse, TaskSummary } from './dto/client-response.dto'

export type ClientWithCreator = PrismaClient & { creator: { id: string; name: string } }

export function toClientResponse(client: ClientWithCreator): ClientResponse {
  return {
    id: client.id,
    companyName: client.companyName,
    industry: client.industry,
    contactName: client.contactName,
    contactEmail: client.contactEmail,
    phone: client.phone,
    notes: client.notes,
    status: client.status,
    createdBy: client.creator,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
  }
}

/** Related-task card shape (FR-CLI-005) — compact, no description/history. */
export function toTaskSummary(task: {
  id: string
  title: string
  status: string
  priority: string
  assignee: { id: string; name: string } | null
  client: { id: string; companyName: string } | null
  dueDate: Date | null
  version: number
  updatedAt: Date
  labels: Array<{ label: { id: string; name: string; color: string } }>
}): TaskSummary {
  return {
    id: task.id,
    title: task.title,
    status: task.status as TaskSummary['status'],
    priority: task.priority as TaskSummary['priority'],
    assignee: task.assignee,
    client: task.client,
    dueDate: task.dueDate,
    version: task.version,
    updatedAt: task.updatedAt,
    labels: task.labels.map((tl) => tl.label),
  }
}
