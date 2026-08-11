// Users service — USR-001..005 (PH-04).
//
// Admin-only resource (controller @Roles(UserRole.ADMIN)).
//
// USR-005 (last-active-admin): demoting an ACTIVE admin to MEMBER or setting
// status INACTIVE runs inside a SERIALIZABLE transaction (ADR-004) that
// re-checks that at least one OTHER ACTIVE admin still exists — the count and
// the update commit atomically, so two concurrent demotions cannot both
// succeed and leave the system without an admin. P2034 (serialization
// failure / deadlock) is retried up to 3 times, then 409 CONCURRENT_MODIFICATION.
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma, UserRole } from '../../../../../packages/api-contract/src/generated/prisma/client'
import { CustomLogger } from '../../common/logger/custom.logger'
import { PrismaService } from '../../database/prisma.service'
import { hashPassword } from '../auth/utils/argon2.util'
import { CreateUserDto } from './dto/create-user.dto'
import type { DeactivationImpact, TaskSummary } from './dto/deactivation-impact.dto'
import type { PageMeta } from './dto/user-response.dto'
import type { UserResponse } from './dto/user-response.dto'
import { UpdateUserDto } from './dto/update-user.dto'
import { UserQueryDto } from './dto/user-query.dto'
import { toUserResponse } from './users.mapper'

const RETRY_ATTEMPTS = 3 // ADR-004 bounded P2034 retry

const OPEN_TASK_STATUSES = ['BACKLOG', 'PENDING', 'IN_PROGRESS', 'BLOCKED'] as const

const USER_NOT_FOUND = {
  code: 'USER_NOT_FOUND',
  detail: 'User not found.',
}

@Injectable()
export class UsersService {
  private readonly logger = new CustomLogger('UsersService')

  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: UserQueryDto): Promise<{ data: UserResponse[]; meta: PageMeta }> {
    const where: Prisma.UserWhereInput = {
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
    }

    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ])

    return {
      data: users.map(toUserResponse),
      meta: { page: query.page, limit: query.limit, total },
    }
  }

  async create(dto: CreateUserDto): Promise<UserResponse> {
    const passwordHash = await hashPassword(dto.password)
    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email, // already normalized by the DTO (ADR-002)
          name: dto.name,
          passwordHash,
          role: dto.role ?? UserRole.MEMBER,
          status: dto.status ?? 'ACTIVE',
        },
      })
      this.logger.log('users.create', { event: 'users.create', userId: user.id, actorRole: 'ADMIN' })
      return toUserResponse(user)
    } catch (error) {
      // ADR-002: unique constraint on normalized email -> 409, never a 500.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: 'EMAIL_ALREADY_EXISTS',
          detail: 'A user with this email already exists.',
          errors: [{ field: 'email', message: 'A user with this email already exists.', code: 'EMAIL_ALREADY_EXISTS' }],
        })
      }
      throw error
    }
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserResponse> {
    // class-transformer exposes unset class props as undefined keys (v0.5+),
    // so an empty body `{}` arrives with all keys undefined — checking key
    // count would let it through as a silent no-op update.
    if (!Object.values(dto).some((value) => value !== undefined)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        detail: 'At least one field (name, role or status) must be provided.',
      })
    }

    return this.withSerializableRetry(async (tx) => {
      // Re-read inside the transaction: the LAST_ADMIN decision must be based
      // on the same snapshot that performs the update (USR-005, ADR-004).
      const current = await tx.user.findUnique({ where: { id } })
      if (!current) {
        throw new NotFoundException(USER_NOT_FOUND)
      }

      if (this.wouldLeaveNoActiveAdmin(current, dto)) {
        const otherActiveAdmins = await tx.user.count({
          where: { role: 'ADMIN', status: 'ACTIVE', id: { not: id } },
        })
        if (otherActiveAdmins === 0) {
          throw new ConflictException({
            code: 'LAST_ADMIN',
            detail: 'Cannot demote or deactivate the last active administrator.',
          })
        }
      }

      const user = await tx.user.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.role !== undefined ? { role: dto.role } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
        },
      })
      this.logger.log('users.update', { event: 'users.update', userId: id, changedFields: Object.keys(dto) })
      return toUserResponse(user)
    })
  }

  async deactivationImpact(id: string): Promise<DeactivationImpact> {
    const user = await this.prisma.user.findUnique({ where: { id } })
    if (!user) {
      throw new NotFoundException(USER_NOT_FOUND)
    }

    const [assigned, created] = await Promise.all([
      this.prisma.task.findMany({
        where: {
          assigneeId: id,
          archivedAt: null,
          status: { in: [...OPEN_TASK_STATUSES] },
        },
        include: {
          assignee: { select: { id: true, name: true } },
          client: { select: { id: true, companyName: true } },
          labels: { select: { label: { select: { id: true, name: true, color: true } } } }, // LAB-002 (PC-04)
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.task.findMany({
        where: {
          creatorId: id,
          archivedAt: null,
          status: { not: 'COMPLETED' },
        },
        include: {
          assignee: { select: { id: true, name: true } },
          client: { select: { id: true, companyName: true } },
          labels: { select: { label: { select: { id: true, name: true, color: true } } } }, // LAB-002 (PC-04)
        },
        orderBy: { updatedAt: 'desc' },
      }),
    ])

    return {
      userId: id,
      assignedTasks: { count: assigned.length, tasks: assigned.map(toTaskSummary) },
      createdTasks: { count: created.length, tasks: created.map(toTaskSummary) },
    }
  }

  /**
   * True when the requested change could remove the LAST active admin:
   * demoting an ACTIVE admin to MEMBER, or deactivating an ACTIVE admin.
   */
  private wouldLeaveNoActiveAdmin(
    current: { role: string; status: string },
    dto: UpdateUserDto,
  ): boolean {
    if (current.role !== 'ADMIN' || current.status !== 'ACTIVE') {
      return false
    }
    const demoted = dto.role !== undefined && dto.role !== 'ADMIN'
    const deactivated = dto.status !== undefined && dto.status !== 'ACTIVE'
    return demoted || deactivated
  }

  /** Serializable transaction with bounded P2034 retry — ADR-004 (USR-005). */
  private async withSerializableRetry<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(fn, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5000,
          timeout: 10000,
        })
      } catch (error) {
        const serializationFailure =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034'
        if (!serializationFailure || attempt === RETRY_ATTEMPTS) {
          if (serializationFailure) {
            throw new ConflictException({
              code: 'CONCURRENT_MODIFICATION',
              detail: 'The user was modified concurrently. Please retry.',
            })
          }
          throw error
        }
        this.logger.warn('users.update.retry', { attempt, reason: 'P2034' })
      }
    }
    throw new ConflictException({
      code: 'CONCURRENT_MODIFICATION',
      detail: 'The user was modified concurrently. Please retry.',
    })
  }
}

function toTaskSummary(task: {
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
