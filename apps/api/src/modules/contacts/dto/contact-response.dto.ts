// Contact response shapes — CONT-API-001..006 (PH-14, PC-01).
//
// The API NEVER exposes the Prisma Contact model directly — every response
// goes through the mapper (contacts.mapper.ts) into these envelopes. The
// raw `clientId` FK becomes the resolved `client` { id, companyName } ref
// (same pattern as TaskSummary.client — the caller gets context without a
// second round-trip).
export interface ContactResponse {
  id: string
  client: { id: string; companyName: string }
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  role: string | null
  isPrimary: boolean
  createdAt: Date
  updatedAt: Date
}

export interface PageMeta {
  page: number
  limit: number
  total: number
}
