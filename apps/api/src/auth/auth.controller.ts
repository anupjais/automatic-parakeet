import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  Req,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';

import {
  getRefreshCookieName,
  getRefreshCookieOptions,
} from './utils/refresh-cookie.util.js';

import { UseGuards } from '@nestjs/common';
import { CsrfGuard } from './guards/csrf.guard.js';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a customer account' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login to customer account' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(dto);
    const { refreshToken, ...publicResult } = result;

    const secure = this.configService.get<boolean>('COOKIE_SECURE', false);

    const refreshTtl = this.configService.get<string>('JWT_REFRESH_TTL', '7d');

    const cookieName = secure ? '__Host-refresh_token' : 'refresh_token';

    response.cookie(
      getRefreshCookieName(this.configService),
      refreshToken,
      getRefreshCookieOptions(this.configService),
    );

    return publicResult;
  }

  @UseGuards(CsrfGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token' })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const cookieName = getRefreshCookieName(this.configService);
    const refreshToken = request.cookies?.[cookieName] as string | undefined;

    const result = await this.authService.refresh(refreshToken ?? '');

    const { refreshToken: nextRefreshToken, ...publicResult } = result;

    response.cookie(
      cookieName,
      nextRefreshToken,
      getRefreshCookieOptions(this.configService),
    );

    return publicResult;
  }

  @UseGuards(CsrfGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and revoke refresh session' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const cookieName = getRefreshCookieName(this.configService);
    const refreshToken = request.cookies?.[cookieName] as string | undefined;

    const result = await this.authService.logout(refreshToken);

    const { maxAge: _maxAge, ...clearOptions } = getRefreshCookieOptions(
      this.configService,
    );

    response.clearCookie(cookieName, clearOptions);

    return result;
  }
}
