// Contacts controller — CONT-API-001..006 (PH-14, PC-01).
//
// Routes (global prefix /api + URI versioning v1):
//   GET    /api/v1/contacts                 -> list (paginated, q/clientId/isPrimary filters)
//   POST   /api/v1/contacts                 -> create (201 + Location; ADMIN only)
//   GET    /api/v1/contacts/:id             -> detail (any authenticated user)
//   PATCH  /api/v1/contacts/:id             -> update (ADMIN only, allowlist DTO)
//   POST   /api/v1/contacts/:id/primary     -> mark primary, unset previous (ADMIN)
//   DELETE /api/v1/contacts/:id             -> physical delete (ADMIN only)
//
// Reads are team-wide (any authenticated user — the global JwtAuthGuard);
// every mutation carries @Roles(UserRole.ADMIN). :id is validated as a UUID
// at the boundary; a malformed id is a 400 INVALID_FORMAT, never a 500.
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import { UserRole } from '../../generated/prisma/client'
import type { AuthUser } from '../auth/auth.types'
import { ContactsService } from './contacts.service'
import { ContactQueryDto } from './dto/contact-query.dto'
import type { ContactResponse, PageMeta } from './dto/contact-response.dto'
import { CreateContactDto } from './dto/create-contact.dto'
import { UpdateContactDto } from './dto/update-contact.dto'

const UUID_PIPE = new ParseUUIDPipe({
  exceptionFactory: (): BadRequestException =>
    new BadRequestException({
      code: 'INVALID_FORMAT',
      detail: 'The contact id must be a valid UUID.',
    }),
})

@Controller('contacts')
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Query() query: ContactQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<{ data: ContactResponse[]; meta: PageMeta }> {
    return this.contactsService.findAll(query, user)
  }

  @Post()
  @Roles(UserRole.ADMIN) // CONT-001: mutations are admin-only
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateContactDto,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ data: ContactResponse }> {
    const contact = await this.contactsService.create(dto, user)
    res.location(`/api/v1/contacts/${contact.id}`)
    return { data: contact }
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(
    @Param('id', UUID_PIPE) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{ data: ContactResponse }> {
    return { data: await this.contactsService.findOne(id, user) }
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN) // CONT-001: mutations are admin-only
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', UUID_PIPE) id: string,
    @Body() dto: UpdateContactDto,
  ): Promise<{ data: ContactResponse }> {
    return { data: await this.contactsService.update(id, dto) }
  }

  @Post(':id/primary')
  @Roles(UserRole.ADMIN) // CONT-001: primary transition is a mutation
  @HttpCode(HttpStatus.OK)
  async markPrimary(
    @Param('id', UUID_PIPE) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{ data: ContactResponse }> {
    return { data: await this.contactsService.markPrimary(id, user) }
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN) // CONT-001: mutations are admin-only
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id', UUID_PIPE) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{ data: ContactResponse }> {
    return { data: await this.contactsService.remove(id, user) }
  }
}
