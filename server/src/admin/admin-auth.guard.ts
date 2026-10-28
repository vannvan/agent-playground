import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ADMIN_COOKIE_NAME, AdminAuthService } from './admin-auth.service';
import type { UserRecord } from '../database.service';

export type AdminRequest = Request & { admin: UserRecord };

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly auth: AdminAuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const origin = request.headers.origin;
    const allowed = process.env.FRONTEND_ORIGIN?.split(',').map((value) => value.trim()).filter(Boolean)
      ?? (process.env.NODE_ENV === 'production' ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5174']);
    if (origin && !allowed.includes(origin)) throw new ForbiddenException('请求来源不受信任');
    const cookie = request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${ADMIN_COOKIE_NAME}=`));
    const token = cookie ? decodeURIComponent(cookie.slice(ADMIN_COOKIE_NAME.length + 1)) : undefined;
    if (!token) throw new UnauthorizedException('请先登录管理员账户');
    const admin = await this.auth.getAdmin(token);
    if (!admin) throw new UnauthorizedException('管理员登录已过期');
    request.admin = admin;
    return true;
  }
}
