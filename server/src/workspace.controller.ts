import {
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  BadRequestException,
  Put,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedRequest } from './auth/auth.guard';
import { SessionAuthGuard } from './auth/auth.guard';
import { DatabaseService } from './database.service';
import { ModelConfigService } from './model-config.service';

@UseGuards(SessionAuthGuard)
@Controller('api')
export class WorkspaceController {
  constructor(
    private readonly database: DatabaseService,
    private readonly modelConfig: ModelConfigService,
  ) {}

  @Get('model-config')
  getModelConfig(@Req() request: AuthenticatedRequest) {
    return this.modelConfig.getPublicConfig(request.user.id);
  }

  @Post('model-config/test')
  testModelConfig(
    @Req() request: AuthenticatedRequest,
    @Body() body: { apiKey?: string; baseUrl?: string; textModel?: string },
  ) {
    return this.modelConfig.testConnection(request.user.id, body);
  }

  @Put('model-config')
  saveModelConfig(
    @Req() request: AuthenticatedRequest,
    @Body() body: { apiKey?: string; baseUrl?: string; textModel?: string; imageModel?: string; videoModel?: string },
  ) {
    return this.modelConfig.save(request.user.id, body);
  }

  @Get('chats')
  listChats(@Req() request: AuthenticatedRequest) {
    return this.database.listUserChats(request.user.id);
  }

  @Post('chats')
  createChat(@Req() request: AuthenticatedRequest) {
    return this.database.createUserChat(request.user.id, randomUUID());
  }

  @Delete('chats/:chatId')
  async deleteChat(@Req() request: AuthenticatedRequest, @Param('chatId') chatId: string) {
    try { await this.database.deleteUserChat(request.user.id, chatId); } catch { throw new NotFoundException('会话不存在'); }
    return { ok: true };
  }

  @Get('chats/:chatId')
  async getChat(@Req() request: AuthenticatedRequest, @Param('chatId') chatId: string) {
    const chat = await this.database.getUserChat(request.user.id, chatId);
    if (!chat) throw new NotFoundException('会话不存在');
    return chat;
  }

  @Get('images')
  listImages(@Req() request: AuthenticatedRequest) {
    return this.database.listUserImages(request.user.id);
  }

  @Get('announcements')
  listAnnouncements(@Req() request: AuthenticatedRequest) {
    return this.database.listUserAnnouncements(request.user.id);
  }

  @Post('announcements/:announcementId/dismiss')
  async dismissAnnouncement(
    @Req() request: AuthenticatedRequest,
    @Param('announcementId') announcementId: string,
  ) {
    const id = Number(announcementId);
    if (!Number.isSafeInteger(id) || id < 1) throw new BadRequestException('公告 ID 无效');
    const dismissed = await this.database.dismissUserAnnouncement(request.user.id, id);
    if (!dismissed) throw new NotFoundException('公告不存在或不可关闭');
    return { ok: true };
  }
}
