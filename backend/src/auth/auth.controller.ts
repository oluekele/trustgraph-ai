import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { authConfig, AuthConfig } from '../config/configuration';
import { CurrentUser, Public } from '../common/decorators/auth.decorators';
import { AuthenticatedUser } from '../common/roles';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(authConfig.KEY) private readonly config: AuthConfig,
  ) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in; sets the httpOnly tg_session cookie (rate-limited per IP)' })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: AuthenticatedUser }> {
    const { user, token } = await this.auth.login(dto.email, dto.password, {
      ip: request.ip ?? null,
      userAgent: request.get('user-agent') ?? null,
    });
    response.cookie(this.config.cookieName, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.cookieSecure,
      maxAge: this.config.sessionMaxAgeMs,
      path: '/',
    });
    return { user };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign out (clears the session cookie)' })
  logout(@Res({ passthrough: true }) response: Response): { ok: true } {
    response.clearCookie(this.config.cookieName, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.cookieSecure,
      path: '/',
    });
    return { ok: true };
  }

  @Get('me')
  @ApiCookieAuth()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'The currently signed-in operator' })
  me(@CurrentUser() user: AuthenticatedUser): { user: AuthenticatedUser } {
    return { user };
  }
}
