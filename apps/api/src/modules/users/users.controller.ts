// Users controller — USR-001..005 (PH-04). Admin-only resource.
//
// Routes (global prefix /api + URI versioning v1):
//   GET    /api/v1/users                  -> list (paginated, q/role/status filters)
//   POST   /api/v1/users                  -> create (201 + Location)
//   PATCH  /api/v1/users/:id              -> update name/role/status (LAST_ADMIN guard)
//   GET    /api/v1/users/:id/deactivation-impact -> open-task impact preview
//
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
  Req,
  Res,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import { Roles } from '../auth/decorators/roles.decorator'
import { UserRole } from '../../generated/prisma/client'
import { UsersService } from './users.service'
import { CreateUserDto } from './dto/create-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'
import { UserQueryDto } from './dto/user-query.dto'
import type { DeactivationImpact } from './dto/deactivation-impact.dto'
import type { PageMeta, UserResponse } from './dto/user-response.dto'

const UUID_PIPE = new ParseUUIDPipe({
  exceptionFactory: (): BadRequestException =>
    new BadRequestException({
      code: 'INVALID_FORMAT',
      detail: 'The user id must be a valid UUID.',
    }),
})

@Controller('users')
@Roles(UserRole.ADMIN) // class-level: every route in this controller is admin-only
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Query() query: UserQueryDto,
  ): Promise<{ data: UserResponse[]; meta: PageMeta }> {
    return this.usersService.findAll(query)
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateUserDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ data: UserResponse }> {
    const user = await this.usersService.create(dto)
    res.location(`/api/v1/users/${user.id}`)
    return { data: user }
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', UUID_PIPE) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<{ data: UserResponse }> {
    return { data: await this.usersService.update(id, dto) }
  }

  @Get(':id/deactivation-impact')
  @HttpCode(HttpStatus.OK)
  async deactivationImpact(@Param('id', UUID_PIPE) id: string): Promise<{ data: DeactivationImpact }> {
    return { data: await this.usersService.deactivationImpact(id) }
  }
}
