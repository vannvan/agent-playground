import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { DatabaseService, UserRecord } from '../database.service';

const scryptAsync = promisify(scrypt);
export const AUTH_COOKIE_NAME = 'studio_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type UserWithPassword = UserRecord & {
  password_hash: string;
  is_active: number | boolean;
  is_deleted: number | boolean;
};

@Injectable()
export class AuthService {
  constructor(private readonly database: DatabaseService) {}

  async signup(emailInput: string, password: string) {
    const email = this.normalizeEmail(emailInput);
    this.validateCredentials(email, password);
    const passwordHash = await this.hashPassword(password);
    try {
      return await this.database.createUser(email, passwordHash);
    } catch (error) {
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
        throw new ConflictException('该邮箱已注册');
      }
      throw error;
    }
  }

  async login(emailInput: string, password: string) {
    const email = this.normalizeEmail(emailInput);
    const user = await this.database.findUserByEmail(email) as UserWithPassword | undefined;
    if (!user || !user.is_active || user.is_deleted || !(await this.verifyPassword(password, user.password_hash))) {
      throw new UnauthorizedException('邮箱或密码错误');
    }
    return { id: user.id, email: user.email };
  }

  async issueSession(user: UserRecord) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await this.database.createAuthSession(user.id, this.hashToken(token), expiresAt);
    return { token, expiresAt };
  }

  async getUserForToken(token: string) {
    return this.database.findUserBySession(this.hashToken(token));
  }

  async revokeToken(token: string) {
    await this.database.deleteAuthSession(this.hashToken(token));
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private validateCredentials(email: string, password: string) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
      throw new BadRequestException('请输入有效的邮箱地址');
    }
    if (password.length < 10 || password.length > 200) {
      throw new BadRequestException('密码长度需为 10 至 200 个字符');
    }
  }

  private async hashPassword(password: string) {
    const salt = randomBytes(16).toString('hex');
    const derived = await scryptAsync(password, salt, 64) as Buffer;
    return `${salt}:${derived.toString('hex')}`;
  }

  private async verifyPassword(password: string, storedHash: string) {
    const [salt, hashHex] = storedHash.split(':');
    if (!salt || !hashHex || !/^[0-9a-f]{128}$/i.test(hashHex)) return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = await scryptAsync(password, salt, expected.length) as Buffer;
    return timingSafeEqual(expected, actual);
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
