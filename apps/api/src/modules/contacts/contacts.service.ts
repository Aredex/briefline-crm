// Contacts service — CONT-API-001..006 (PH-14, PC-01).
//
// Permission model: contacts are team-wide readable for every authenticated
// user; create/update/delete/primary transitions are ADMIN-only (controller
// @Roles). No soft-delete: physical delete is consistent with the rest of the
// MVP (clients are archived, but contacts are child rows — CONT-001).
//
// CONT-001 invariants:
//   - at most ONE primary contact per client — enforced atomically in
//     markPrimary() (unset-all-then-mark inside one transaction) AND backed by
//     the partial unique index contacts_single_primary_per_client (DB-007
//     pattern: direct writes that bypass the API fail).
//   - no duplicate emails per client — unique (clientId, email) index; P2002
//     becomes 409 CONTACT_EMAIL_EXISTS, never a 500.
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '../../../../../packages/api-contract/src/generated/prisma/client'
import type { AuthUser } from '../auth/auth.types'
import { CustomLogger } from '../../common/logger/custom.logger'
import { PrismaService } from '../../database/prisma.service'
import type { ContactQueryDto } from './dto/contact-query.dto'
import type { ContactResponse, PageMeta } from './dto/contact-response.dto'
import { CreateContactDto } from './dto/create-contact.dto'
import { UpdateContactDto } from './dto/update-contact.dto'
import { toContactResponse, type ContactWithClient } from './contacts.mapper'

const CONTACT_NOT_FOUND = {
  code: 'CONTACT_NOT_FOUND',
  detail: 'The requested contact does not exist or is not visible to you.',
}

const CLIENT_NOT_FOUND = {
  code: 'CLIENT_NOT_FOUND',
  detail: 'The requested client does not exist or is not visible to you.',
}

const DUPLICATE_EMAIL = {
  code: 'CONTACT_EMAIL_EXISTS',
  detail: 'A contact with this email already exists for this client.',
}

const CONTACT_INCLUDE = {
  client: { select: { id: true, companyName: true } },
} as const satisfies Prisma.ContactInclude

// Contractual sort: primary contacts first, then lastName/firstName asc.
const CONTACT_ORDER: Prisma.ContactOrderByWithRelationInput[] = [
  { isPrimary: 'desc' },
  { lastName: 'asc' },
  { firstName: 'asc' },
]

@Injectable()
export class ContactsService {
  private readonly logger = new CustomLogger('ContactsService')

  constructor(private readonly prisma: PrismaService) {}

  /** CONT-API-002 — paginated list with q/clientId/isPrimary filters. */
  async findAll(query: ContactQueryDto, actor: AuthUser): Promise<{ data: ContactResponse[]; meta: PageMeta }> {
    void actor // team-wide view — the guard only enforces authentication
    const where = this.buildListWhere(query)
    const [total, contacts] = await this.prisma.$transaction([
      this.prisma.contact.count({ where }),
      this.prisma.contact.findMany({
        where,
        include: CONTACT_INCLUDE,
        orderBy: CONTACT_ORDER,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ])
    return {
      data: contacts.map(toContactResponse),
      meta: { page: query.page, limit: query.limit, total },
    }
  }

  /** CONT-API-001 — create (ADMIN). Unknown clientId -> 404, never a P2003 500. */
  async create(dto: CreateContactDto, actor: AuthUser): Promise<ContactResponse> {
    const client = await this.prisma.client.findUnique({
      where: { id: dto.clientId },
      select: { id: true },
    })
    if (!client) {
      throw new NotFoundException(CLIENT_NOT_FOUND)
    }
    try {
      const contact = await this.prisma.contact.create({
        data: {
          clientId: dto.clientId,
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email ?? null,
          phone: dto.phone ?? null,
          role: dto.role ?? null,
        },
        include: CONTACT_INCLUDE,
      })
      this.logger.log('contacts.create', {
        event: 'contacts.create',
        contactId: contact.id,
        clientId: dto.clientId,
        actorId: actor.id,
      })
      return toContactResponse(contact)
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw this.duplicateEmail()
      }
      throw error
    }
  }

  /** CONT-API-003 — detail (any authenticated user). */
  async findOne(id: string, actor: AuthUser): Promise<ContactResponse> {
    void actor
    const contact = await this.prisma.contact.findUnique({
      where: { id },
      include: CONTACT_INCLUDE,
    })
    if (!contact) {
      throw new NotFoundException(CONTACT_NOT_FOUND)
    }
    return toContactResponse(contact)
  }

  /** CONT-API-004 — field-level allowlist update (ADMIN). Empty body -> 400. */
  async update(id: string, dto: UpdateContactDto): Promise<ContactResponse> {
    // class-transformer exposes unset class props as undefined keys (v0.5+),
    // so an empty body `{}` arrives with all keys undefined — checking key
    // count would let it through as a silent no-op update.
    if (!Object.values(dto).some((value) => value !== undefined)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        detail: 'At least one field (firstName, lastName, email, phone or role) must be provided.',
      })
    }
    const existing = await this.prisma.contact.findUnique({ where: { id }, select: { id: true } })
    if (!existing) {
      throw new NotFoundException(CONTACT_NOT_FOUND)
    }
    try {
      const updated = await this.prisma.contact.update({
        where: { id },
        data: {
          ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
          ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
          ...(dto.email !== undefined ? { email: dto.email } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.role !== undefined ? { role: dto.role } : {}),
        },
        include: CONTACT_INCLUDE,
      })
      this.logger.log('contacts.update', { event: 'contacts.update', contactId: id, changedFields: Object.keys(dto) })
      return toContactResponse(updated)
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw this.duplicateEmail()
      }
      throw error
    }
  }

  /**
   * CONT-API-005 — primary transition (ADMIN). Marks a contact as the primary
   * for its client, unsetting the previous primary in the SAME transaction
   * (CONT-001). Idempotent: marking the current primary is a 200 no-op.
   */
  async markPrimary(id: string, actor: AuthUser): Promise<ContactResponse> {
    return this.prisma.$transaction(async (tx) => {
      const contact = await tx.contact.findUnique({ where: { id }, include: CONTACT_INCLUDE })
      if (!contact) {
        throw new NotFoundException(CONTACT_NOT_FOUND)
      }
      if (contact.isPrimary) {
        return toContactResponse(contact) // idempotent no-op
      }
      // Unset every other primary of the client FIRST, then mark — the two
      // writes commit atomically, so the invariant holds even mid-transaction.
      await tx.contact.updateMany({
        where: { clientId: contact.clientId, isPrimary: true, id: { not: contact.id } },
        data: { isPrimary: false, updatedAt: new Date() },
      })
      const updated = await tx.contact.update({
        where: { id },
        data: { isPrimary: true, updatedAt: new Date() },
        include: CONTACT_INCLUDE,
      })
      this.logger.log('contacts.markPrimary', {
        event: 'contacts.markPrimary',
        contactId: id,
        clientId: contact.clientId,
        actorId: actor.id,
      })
      return toContactResponse(updated)
    })
  }

  /** CONT-API-006 — physical delete (ADMIN). 404 on unknown; no soft-delete in the MVP. */
  async remove(id: string, actor: AuthUser): Promise<ContactResponse> {
    const contact = await this.prisma.contact.findUnique({
      where: { id },
      include: CONTACT_INCLUDE,
    })
    if (!contact) {
      throw new NotFoundException(CONTACT_NOT_FOUND)
    }
    await this.prisma.contact.delete({ where: { id } })
    this.logger.log('contacts.remove', {
      event: 'contacts.remove',
      contactId: id,
      clientId: contact.clientId,
      actorId: actor.id,
    })
    return toContactResponse(contact) // last-known state, before the delete
  }

  /** q searches firstName/lastName/email; clientId and isPrimary are exact filters. */
  private buildListWhere(query: ContactQueryDto): Prisma.ContactWhereInput {
    const where: Prisma.ContactWhereInput = {}
    const filters: Prisma.ContactWhereInput[] = []
    if (query.q) {
      filters.push({
        OR: [
          { firstName: { contains: query.q, mode: 'insensitive' } },
          { lastName: { contains: query.q, mode: 'insensitive' } },
          { email: { contains: query.q, mode: 'insensitive' } },
        ],
      })
    }
    if (query.clientId) {
      filters.push({ clientId: query.clientId })
    }
    if (query.isPrimary !== undefined) {
      filters.push({ isPrimary: query.isPrimary })
    }
    if (filters.length > 0) {
      where.AND = filters
    }
    return where
  }

  /** 409 for the (clientId, email) unique index — CONT-001, mirrored in the catalogue. */
  private duplicateEmail(): ConflictException {
    return new ConflictException({
      ...DUPLICATE_EMAIL,
      errors: [{ field: 'email', message: DUPLICATE_EMAIL.detail, code: DUPLICATE_EMAIL.code }],
    })
  }
}

export type { ContactWithClient }
