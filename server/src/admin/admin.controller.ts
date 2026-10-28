import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AdminRequest } from './admin-auth.guard';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminAuthService } from './admin-auth.service';
import { DatabaseService } from '../database.service';

type AnnouncementBody = {
  title?: string;
  message?: string;
  type?: string;
  isPublished?: boolean;
  isDismissible?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
};

@UseGuards(AdminAuthGuard)
@Controller('api/admin')
export class AdminController {
  constructor(
    private readonly database: DatabaseService,
    private readonly adminAuth: AdminAuthService,
  ) {}

  @Get('overview')
  overview() {
    return this.database.getAdminOverview();
  }

  @Get('users')
  users(
    @Query('search') search = '',
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const size = this.pageSize(pageSize);
    const currentPage = Math.max(Number(page) || 1, 1);
    return this.database.listAdminUsers(search.trim(), size, (currentPage - 1) * size);
  }

  @Post('users')
  async createUser(@Body() body: { email?: string; password?: string }) {
    if (!body.email || !body.password) throw new BadRequestException('请输入邮箱和初始密码');
    await this.adminAuth.createUser(body.email, body.password);
    return { ok: true };
  }

  @Patch('users/:userId/status')
  async setUserStatus(
    @Param('userId') userId: string,
    @Body() body: { isActive?: boolean },
  ) {
    const id = this.parseId(userId);
    if (typeof body.isActive !== 'boolean') throw new BadRequestException('用户状态无效');
    const updated = await this.database.setUserActive(id, body.isActive);
    if (!updated) throw new NotFoundException('用户不存在');
    return { ok: true };
  }

  @Delete('users/:userId')
  async deleteUser(@Param('userId') userId: string) {
    const deleted = await this.database.deleteAdminUser(this.parseId(userId));
    if (!deleted) throw new NotFoundException('用户不存在');
    return {
      ok: true,
      message: '用户已删除；聊天会话、系统公告和其他历史数据均已保留。',
    };
  }

  @Patch('users/:userId/password')
  async resetUserPassword(
    @Param('userId') userId: string,
    @Body() body: { password?: string },
  ) {
    if (!body.password) throw new BadRequestException('请输入新密码');
    const updated = await this.adminAuth.resetUserPassword(this.parseId(userId), body.password);
    if (!updated) throw new NotFoundException('用户不存在');
    return { ok: true };
  }

  @Get('sessions')
  sessions(
    @Query('search') search = '',
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const size = this.pageSize(pageSize);
    const currentPage = Math.max(Number(page) || 1, 1);
    return this.database.listAdminChats(search.trim(), size, (currentPage - 1) * size);
  }

  @Get('generations/:kind')
  generations(
    @Param('kind') kind: string,
    @Query('search') search = '',
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    if (kind !== 'image' && kind !== 'rewrite') throw new BadRequestException('创作数据类型无效');
    const size = this.pageSize(pageSize);
    const currentPage = Math.max(Number(page) || 1, 1);
    return this.database.listAdminGenerations(kind, search.trim(), size, (currentPage - 1) * size);
  }

  @Get('generations/:kind/:id')
  async generation(@Param('kind') kind: string, @Param('id') id: string) {
    if (kind !== 'image' && kind !== 'rewrite') throw new BadRequestException('创作数据类型无效');
    const result = await this.database.getAdminGeneration(kind, id);
    if (!result) throw new NotFoundException('创作记录不存在');
    return result;
  }

  @Get('sessions/:sessionId')
  async session(
    @Param('sessionId') sessionId: string,
    @Query('kind') kind = 'chat',
  ) {
    this.validateSessionKind(kind);
    const result = await this.database.getAdminChat(sessionId, kind);
    if (!result) throw new NotFoundException('会话不存在');
    return result;
  }

  @Delete('sessions/:sessionId')
  async deleteSession(
    @Param('sessionId') sessionId: string,
    @Query('kind') kind = 'chat',
  ) {
    this.validateSessionKind(kind);
    await this.database.deleteAdminChat(sessionId, kind);
    return { ok: true };
  }

  @Get('admins')
  admins() {
    return this.database.listAdminAccounts();
  }

  @Post('admins')
  async createAdmin(@Body() body: { email?: string; password?: string }) {
    if (!body.email || !body.password) throw new BadRequestException('请输入管理员邮箱和密码');
    await this.adminAuth.createAdmin(body.email, body.password);
    return { ok: true };
  }

  @Patch('admins/:adminId/password')
  async changeAdminPassword(
    @Param('adminId') adminId: string,
    @Body() body: { password?: string },
  ) {
    if (!body.password || body.password.length < 14 || body.password.length > 200) {
      throw new BadRequestException('管理员密码长度需为 14 至 200 个字符');
    }
    await this.database.changeAdminPassword(this.parseId(adminId), await this.adminAuth.hashPassword(body.password));
    return { ok: true };
  }

  @Delete('admins/:adminId')
  async deleteAdmin(@Param('adminId') adminId: string, @Req() request: AdminRequest) {
    try {
      await this.database.deleteAdminAccount(this.parseId(adminId), request.admin.id);
      return { ok: true };
    } catch (error) {
      if (error instanceof Error && error.message.includes('管理员账户')) throw new ConflictException(error.message);
      if (error instanceof Error && error.message.includes('当前登录')) throw new ConflictException(error.message);
      throw error;
    }
  }

  @Get('announcements')
  announcements() {
    return this.database.listAdminAnnouncements();
  }

  @Post('announcements')
  async createAnnouncement(
    @Body() body: AnnouncementBody,
    @Req() request: AdminRequest,
  ) {
    const announcement = this.parseAnnouncement(body);
    const id = await this.database.createAdminAnnouncement({
      ...announcement,
      createdBy: request.admin.id,
    });
    return { id };
  }

  @Patch('announcements/:announcementId')
  async updateAnnouncement(
    @Param('announcementId') announcementId: string,
    @Body() body: AnnouncementBody,
  ) {
    const updated = await this.database.updateAdminAnnouncement(
      this.parseId(announcementId),
      this.parseAnnouncement(body),
    );
    if (!updated) throw new NotFoundException('公告不存在');
    return { ok: true };
  }

  @Delete('announcements/:announcementId')
  async deleteAnnouncement(@Param('announcementId') announcementId: string) {
    const deleted = await this.database.deleteAdminAnnouncement(this.parseId(announcementId));
    if (!deleted) throw new NotFoundException('公告不存在');
    return { ok: true };
  }

  private pageSize(value: string) {
    return Math.min(Math.max(Number(value) || 20, 1), 100);
  }

  private validateSessionKind(kind: string) {
    if (kind !== 'chat' && kind !== 'legacy') {
      throw new BadRequestException('会话类型无效');
    }
  }

  private parseAnnouncement(body: AnnouncementBody) {
    const title = body.title?.trim();
    const message = body.message?.trim();
    if (!title || title.length > 160) throw new BadRequestException('公告标题长度需为 1 至 160 个字符');
    if (!message || message.length > 3000) throw new BadRequestException('公告内容长度需为 1 至 3000 个字符');
    if (!['info', 'success', 'warning', 'urgent'].includes(body.type ?? '')) {
      throw new BadRequestException('公告类型无效');
    }
    if (typeof body.isPublished !== 'boolean' || typeof body.isDismissible !== 'boolean') {
      throw new BadRequestException('公告发布状态或关闭设置无效');
    }
    const startsAt = this.parseDate(body.startsAt, '开始时间');
    const endsAt = this.parseDate(body.endsAt, '结束时间');
    if (startsAt && endsAt && startsAt >= endsAt) {
      throw new BadRequestException('结束时间必须晚于开始时间');
    }
    return {
      title,
      message,
      type: body.type as 'info' | 'success' | 'warning' | 'urgent',
      isPublished: body.isPublished,
      isDismissible: body.isDismissible,
      startsAt,
      endsAt,
    };
  }

  private parseDate(value: string | null | undefined, label: string) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException(`${label}格式无效`);
    return date;
  }

  private parseId(value: string) {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1) throw new BadRequestException('ID 无效');
    return id;
  }
}
