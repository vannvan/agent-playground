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
import { AUTH_COOKIE_NAME, AuthService } from './auth.service';
import { SessionAuthGuard } from './auth.guard';
import type { AuthenticatedRequest } from './auth.guard';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('signup')
  async signup(
    @Body() body: { email?: string; password?: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    if (typeof body.email !== 'string' || typeof body.password !== 'string') {
      throw new BadRequestException('请输入邮箱和密码');
    }
    const user = await this.auth.signup(body.email, body.password);
    await this.setSessionCookie(user, response);
    return { user };
  }

  @Post('login')
  async login(
    @Body() body: { email?: string; password?: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    if (typeof body.email !== 'string' || typeof body.password !== 'string') {
      throw new BadRequestException('请输入邮箱和密码');
    }
    const user = await this.auth.login(body.email, body.password);
    await this.setSessionCookie(user, response);
    return { user };
  }

  @Post('logout')
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const token = this.readToken(request.headers.cookie);
    if (token) await this.auth.revokeToken(token);
    response.clearCookie(AUTH_COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
    return { ok: true };
  }

  @UseGuards(SessionAuthGuard)
  @Get('me')
  me(@Req() request: AuthenticatedRequest) {
    return { user: request.user };
  }

  private async setSessionCookie(user: { id: number; email: string }, response: Response) {
    const { token, expiresAt } = await this.auth.issueSession(user);
    response.cookie(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });
  }

  private readToken(header: string | undefined) {
    const pair = header?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${AUTH_COOKIE_NAME}=`));
    return pair ? decodeURIComponent(pair.slice(AUTH_COOKIE_NAME.length + 1)) : undefined;
  }
}
