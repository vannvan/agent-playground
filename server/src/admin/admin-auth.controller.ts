import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ADMIN_COOKIE_NAME, AdminAuthService } from './admin-auth.service';
import { AdminAuthGuard } from './admin-auth.guard';
import type { AdminRequest } from './admin-auth.guard';

@Controller('api/admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Post('login')
  async login(
    @Body() body: { email?: string; password?: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!body.email || !body.password) throw new BadRequestException('请输入管理员邮箱和密码');
    const result = await this.auth.login(body.email, body.password);
    response.cookie(ADMIN_COOKIE_NAME, result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: result.expiresAt,
    });
    return { admin: result.admin };
  }

  @Post('logout')
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const token = this.getToken(request);
    if (token) await this.auth.logout(token);
    response.clearCookie(ADMIN_COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
    return { ok: true };
  }

  @UseGuards(AdminAuthGuard)
  @Get('me')
  me(@Req() request: AdminRequest) {
    return { admin: request.admin };
  }

  private getToken(request: Request) {
    const cookie = request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${ADMIN_COOKIE_NAME}=`));
    return cookie ? decodeURIComponent(cookie.slice(ADMIN_COOKIE_NAME.length + 1)) : undefined;
  }
}
