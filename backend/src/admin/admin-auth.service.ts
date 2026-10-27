import {
  BadRequestException,
  ConflictException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { DatabaseService } from '../database.service';

const scryptAsync = promisify(scrypt);
export const ADMIN_COOKIE_NAME = 'studio_admin_session';
const ADMIN_SESSION_TTL = 8 * 60 * 60 * 1000;

@Injectable()
export class AdminAuthService implements OnModuleInit {
  constructor(private readonly database: DatabaseService) {}

  async onModuleInit() {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) return;
    if (await this.database.hasAdminAccounts()) return;
    if (password.length < 14) throw new Error('ADMIN_PASSWORD must contain at least 14 characters');
    await this.database.seedAdminAccount(email, await this.hashPassword(password));
  }

  async login(emailInput: string, password: string) {
    
    const email = emailInput.trim().toLowerCase();
    const admin = await this.database.findAdminByEmail(email);
    if (!admin || !(await this.verifyPassword(password, admin.password_hash))) {
      throw new UnauthorizedException('邮箱或密码错误');
    }
    await this.database.updateAdminLastLogin(admin.id);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL);
    await this.database.createAdminSession(admin.id, this.hashToken(token), expiresAt);
    return { token, expiresAt, admin: { id: admin.id, email: admin.email } };
  }

  async getAdmin(token: string) {
    return this.database.findAdminBySession(this.hashToken(token));
  }

  async logout(token: string) {
    return this.database.deleteAdminSession(this.hashToken(token));
  }

  async hashPassword(password: string) {
    const salt = randomBytes(16).toString('hex');
    const derived = await scryptAsync(password, salt, 64) as Buffer;
    return `${salt}:${derived.toString('hex')}`;
  }

  async verifyPassword(password: string, storedHash: string) {
    const [salt, hashHex] = storedHash.split(':');
    if (!salt || !hashHex || !/^[0-9a-f]{128}$/i.test(hashHex)) return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = await scryptAsync(password, salt, expected.length) as Buffer;
    return timingSafeEqual(expected, actual);
  }

  async createAdmin(emailInput: string, password: string) {
    const email = emailInput.trim().toLowerCase();
    this.validateEmail(email);
    if (password.length < 14 || password.length > 200) {
      throw new BadRequestException('管理员密码长度需为 14 至 200 个字符');
    }
    try {
      await this.database.createAdminAccount(email, await this.hashPassword(password));
    } catch (error) {
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY') throw new ConflictException('管理员邮箱已存在');
      throw error;
    }
  }

  async createUser(emailInput: string, password: string) {
    const email = emailInput.trim().toLowerCase();
    this.validateCredentials(email, password);
    try {
      await this.database.createUser(email, await this.hashPassword(password));
    } catch (error) {
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY') throw new ConflictException('用户邮箱已存在');
      throw error;
    }
  }

  async resetUserPassword(userId: number, password: string) {
    if (password.length < 10 || password.length > 200) throw new BadRequestException('密码长度需为 10 至 200 个字符');
    return this.database.changeUserPassword(userId, await this.hashPassword(password));
  }

  private validateCredentials(email: string, password: string) {
    this.validateEmail(email);
    if (password.length < 10 || password.length > 200) {
      throw new BadRequestException('密码长度需为 10 至 200 个字符');
    }
  }

  private validateEmail(email: string) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
      throw new BadRequestException('请输入有效的邮箱地址');
    }
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
