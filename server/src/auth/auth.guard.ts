import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AUTH_COOKIE_NAME, AuthService } from './auth.service';
import type { UserRecord } from '../database.service';

export type AuthenticatedRequest = Request & { user: UserRecord };

function readCookie(header: string | undefined, name: string) {
  const entry = header?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : undefined;
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const origin = request.headers.origin;
    if (origin && !this.allowedOrigins().includes(origin)) {
      throw new ForbiddenException('请求来源不受信任');
    }

    const token = readCookie(request.headers.cookie, AUTH_COOKIE_NAME);
    if (!token) throw new UnauthorizedException('请先登录');
    const user = await this.auth.getUserForToken(token);
    if (!user) throw new UnauthorizedException('登录已过期，请重新登录');
    request.user = user;
    return true;
  }

  private allowedOrigins() {
    const configured = process.env.FRONTEND_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean);
    if (configured?.length) return configured;
    return process.env.NODE_ENV === 'production'
      ? []
      : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5174'];
  }
}
