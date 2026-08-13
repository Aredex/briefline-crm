// Contact -> ContactResponse mapper — CONT-API-001..006 (PH-14, PC-01).
//
// The single place where the Prisma Contact row is shaped into the API
// contract: the raw `clientId` FK becomes the resolved `client` { id,
// companyName } ref, and no internal columns leak into responses. Every
// response path MUST go through it.
import type { Contact as PrismaContact } from '../../generated/prisma/client'
import type { ContactResponse } from './dto/contact-response.dto'

export type ContactWithClient = PrismaContact & { client: { id: string; companyName: string } }

export function toContactResponse(contact: ContactWithClient): ContactResponse {
  return {
    id: contact.id,
    client: contact.client,
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email,
    phone: contact.phone,
    role: contact.role,
    isPrimary: contact.isPrimary,
    createdAt: contact.createdAt,
    updatedAt: contact.updatedAt,
  }
}
