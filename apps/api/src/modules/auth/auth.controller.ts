// Auth controller — AUTH-001 (PH-04).
//
// Routes (global prefix /api + URI versioning v1):
//   GET  /api/v1/auth/csrf   -> pre-auth CSRF token (Public)
//   POST /api/v1/auth/login  -> login (Public, throttled 5/min per IP)
//   POST /api/v1/auth/logout -> logout (JWT required)
//   GET  /api/v1/auth/me     -> current user (JWT required)
//
// The CSRF token is ALWAYS returned in the body (signed double-submit): the
// matching cookie is set by csrf-csrf, the raw value must be echoed back in
// the X-CSRF-Token header by the client (browser JS stores it in memory).
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common'
import { Throttle, seconds } from '@nestjs/throttler'
import type { Request, Response } from 'express'
import { CurrentUser } from './decorators/current-user.decorator'
import { Public } from './decorators/public.decorator'
import type { AuthUser } from './auth.types'
import { AuthService } from './auth.service'
import { LoginDto } from './dto/login.dto'

const LOGIN_THROTTLE = { auth: { limit: 5, ttl: seconds(60), blockDuration: seconds(300) } }

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Get('csrf')
  @HttpCode(HttpStatus.OK)
  async getCsrfToken(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ data: { csrfToken: string } }> {
    const csrfToken = await this.authService.issueCsrfToken(req, res)
    return { data: { csrfToken } }
  }

  @Public()
  @Post('login')
  @Throttle(LOGIN_THROTTLE)
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ data: { csrfToken: string; user: AuthUser } }> {
    const { csrfToken, user } = await this.authService.login(dto, req, res)
    return { data: { csrfToken, user } }
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ data: { ok: boolean } }> {
    const result = await this.authService.logout(req, res)
    return { data: result }
  }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  getCurrentUser(@CurrentUser() user: AuthUser): { data: AuthUser } {
    return { data: this.authService.getCurrentUser(user) }
  }
}
