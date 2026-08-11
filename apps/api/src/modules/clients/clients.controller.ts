// Clients controller — CLI-API-001..005 (PH-05).
//
// Routes (global prefix /api + URI versioning v1):
//   GET    /api/v1/clients                    -> list (paginated, q/status filters)
//   POST   /api/v1/clients                    -> create (201 + Location; any active user)
//   GET    /api/v1/clients/:id                -> detail + paginated related tasks
//   PATCH  /api/v1/clients/:id                -> update (ADMIN only, allowlist DTO)
//   POST   /api/v1/clients/:id/deactivate     -> ACTIVE -> INACTIVE (ADMIN only)
//   POST   /api/v1/clients/:id/archive        -> ARCHIVED (ADMIN only, 409 double-archive)
//
// The controller is NOT class-level admin: list/get/create are team-wide
// (BR-005/006). Only the mutation routes carry @Roles(UserRole.ADMIN).
// :id is validated as a UUID at the boundary; a malformed id is a 400
// INVALID_FORMAT, never a 500 from Prisma's UUID cast error.
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common'
import type { Response } from 'express'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { UserRole } from '../../../../../packages/api-contract/src/generated/prisma/client'
import type { AuthUser } from '../auth/auth.types'
import { ClientsService } from './clients.service'
import { ClientQueryDto } from './dto/client-query.dto'
import { CreateClientDto } from './dto/create-client.dto'
import { UpdateClientDto } from './dto/update-client.dto'
import type { ClientResponse, ClientWithTasksResponse, PageMeta } from './dto/client-response.dto'

const UUID_PIPE = new ParseUUIDPipe({
  exceptionFactory: (): BadRequestException =>
    new BadRequestException({
      code: 'INVALID_FORMAT',
      detail: 'The client id must be a valid UUID.',
    }),
})

@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Query() query: ClientQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<{ data: ClientResponse[]; meta: PageMeta }> {
    return this.clientsService.findAll(query, user)
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateClientDto,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ data: ClientResponse }> {
    const client = await this.clientsService.create(dto, user)
    res.location(`/api/v1/clients/${client.id}`)
    return { data: client }
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(
    @Param('id', UUID_PIPE) id: string,
    @Query() query: ClientQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<{ data: ClientWithTasksResponse }> {
    return { data: await this.clientsService.findOne(id, query, user) }
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN) // BR-006: admin-only mutation
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', UUID_PIPE) id: string,
    @Body() dto: UpdateClientDto,
  ): Promise<{ data: ClientResponse }> {
    return { data: await this.clientsService.update(id, dto) }
  }

  @Post(':id/deactivate')
  @Roles(UserRole.ADMIN) // BR-006: admin-only mutation
  @HttpCode(HttpStatus.OK)
  async deactivate(@Param('id', UUID_PIPE) id: string): Promise<{ data: ClientResponse }> {
    return { data: await this.clientsService.deactivate(id) }
  }

  @Post(':id/archive')
  @Roles(UserRole.ADMIN) // BR-006: admin-only mutation
  @HttpCode(HttpStatus.OK)
  async archive(@Param('id', UUID_PIPE) id: string): Promise<{ data: ClientResponse }> {
    return { data: await this.clientsService.archive(id) }
  }
}
