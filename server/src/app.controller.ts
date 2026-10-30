import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Inject,
  NotFoundException,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedRequest } from './auth/auth.guard';
import { SessionAuthGuard } from './auth/auth.guard';
import { DatabaseService } from './database.service';
import { ModelConfigService } from './model-config.service';
import { Logger } from '@nestjs/common';
import { SkillRouterService } from './skills/skill-router.service';
import { SKILL_REGISTRY, SkillRegistry } from './skills/skill-registry';
import { AiEngineService } from './ai-engine/ai-engine.service';
import type { ConversationMode, ChatRequest } from './conversation.types';

export const SUPPORTED_IMAGE_SIZES = [
  '512x512',
  '768x768',
  '1024x1024',
  '1024x1536',
  '1536x1024',
  '1024x1792',
  '1792x1024',
] as const;

export function validateImageSize(size?: string) {
  const selectedSize = size || '1024x1024';
  if (!SUPPORTED_IMAGE_SIZES.includes(selectedSize as typeof SUPPORTED_IMAGE_SIZES[number])) {
    throw new BadRequestException(`不支持的图片尺寸，可选值：${SUPPORTED_IMAGE_SIZES.join('、')}`);
  }
  return selectedSize;
}

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);
  private readonly modelConfig: ModelConfigService;
  private readonly skillRegistry: SkillRegistry;
  private readonly aiEngine: AiEngineService;

  constructor(
    private readonly database: DatabaseService = new DatabaseService(),
    modelConfig?: ModelConfigService,
    @Inject(SKILL_REGISTRY) skillRegistry?: SkillRegistry,
  ) {
    this.modelConfig = modelConfig ?? new ModelConfigService(this.database);
    this.skillRegistry = skillRegistry ?? new SkillRegistry();
    this.aiEngine = new AiEngineService();
    this.logger = new Logger(AppController.name);
  }

  @UseGuards(SessionAuthGuard)
  @Post('api/images/generations')
  async generateImage(
    @Body() body: { prompt?: string; size?: string },
    @Req() request: AuthenticatedRequest,
  ) {
    const prompt = body.prompt?.trim();
    if (!prompt) throw new BadRequestException('请输入图片描述');

    const config = await this.modelConfig.getPrivateConfig(request.user.id);
    const baseUrl = config.baseUrl.replace(/\/+$/, '');
    const model = config.imageModel;
    if (!model) throw new BadRequestException('请先在模型配置中填写图像模型名称');
    const size = validateImageSize(body.size);
    const startedAt = Date.now();
    const requestId = randomUUID();

    try {
      const upstream = await fetch(`${baseUrl}/images/generations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, size, n: 1, response_format: 'url' }),
      });
      const payload = await upstream.json() as { data?: Array<{ url?: string; b64_json?: string }>; error?: { message?: string } };
      if (!upstream.ok) throw new BadGatewayException(payload.error?.message || `图像服务请求失败（${upstream.status}）`);

      const image = payload.data?.[0];
      const url = image?.url || (image?.b64_json ? `[image omitted]${image.b64_json}` : undefined);
      if (!url) throw new BadGatewayException('图像服务未返回图片');
      const id = randomUUID();
      await this.database.saveUserImage(request.user.id, { id, prompt, size, model, url });
      await this.database.recordUserGenerationRequest(requestId, request.user.id, 'image', Date.now() - startedAt, 'success');
      return { id, url, prompt, size, model };
    } catch (error) {
      await this.database.recordUserGenerationRequest(requestId, request.user.id, 'image', Date.now() - startedAt, 'error', error instanceof Error ? error.message : '无法连接图像服务');
      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException(error instanceof Error ? error.message : '无法连接图像服务');
    }
  }

  /**
   * 统一聊天接口：根据 mode + skillId 决定路由策略。
   *
   * 协议：
   *   mode='chat'   → 直接调用 LLM（原有行为）
   *   mode='skill'  → 读取 skillId，路由到对应技能；未注册则回退到 LLM
   *
   * chatId 不传时自动新建会话，新建时写入 mode/skillId 元数据。
   * 已有会话自动沿用历史 mode，忽略请求中的重复指定（保持会话一致性）。
   */
  @UseGuards(SessionAuthGuard)
  @Post('api/chat')
  async chat(
    @Body() body: ChatRequest,
    @Res() response: Response,
    @Req() request: AuthenticatedRequest,
  ) {
    const rawMessage = body.message?.trim();
    if (!rawMessage) throw new BadRequestException('请输入问题');
    if (!body.mode) throw new BadRequestException('缺少会话模式 mode');

    const user = request.user;

    // 获取或创建会话
    let chatId = body.chatId;
    if (!chatId) {
      chatId = randomUUID();
      await this.database.createUserChat(user.id, chatId);
    } else {
      const existing = await this.database.getUserChat(user.id, chatId);
      if (!existing) throw new NotFoundException('会话不存在');
      // 已有会话：若请求未指定 mode，则沿用 DB 存储值；否则以请求为准
      if (!body.mode && existing.chat.mode) body.mode = existing.chat.mode as ConversationMode;
      if (!body.skillId && existing.chat.skillId) body.skillId = existing.chat.skillId;
    }

    const existingChat = await this.database.getUserChat(user.id, chatId);
    if (!existingChat) throw new NotFoundException('会话不存在');
    const history = existingChat.messages as Array<{ role: 'user' | 'assistant'; content: string }>;
    const privateConfig = await this.modelConfig.getPrivateConfig(user.id);
    const requestId = randomUUID();
    const startedAt = Date.now();

    // 打开 SSE 响应头
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();

    // 剥离 @skill 前缀，获取纯用户问题
    const skillMatch = rawMessage.match(/^@([^\s]+)\s*(.*)$/s);
    let effectiveSkillId: string | null = null;
    let userMessage = rawMessage;
    if (skillMatch) {
      effectiveSkillId = skillMatch[1];
      userMessage = skillMatch[2].trim();
    }
    // 优先使用请求体中的 skillId（会话级约定），其次用消息前缀
    const resolvedSkillId = body.skillId ?? effectiveSkillId;

    let answer = '';
    const finishStream = async (reader: AsyncIterable<string>) => {
      for await (const chunk of reader) {
        response.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
        answer += chunk;
      }
      await this.database.appendUserChatExchange(
        user.id, chatId, rawMessage, answer, privateConfig.textModel,
        body.mode, resolvedSkillId,
      );
      await this.database.recordUserGenerationRequest(
        requestId, user.id, 'chat', Date.now() - startedAt, 'success',
      );
      response.write('event: done\ndata: {}\n\n');
    };

    try {
      this.logger.log(`mode=${body.mode} resolvedSkillId=${resolvedSkillId} message=${userMessage.slice(0,50)}`);
      this.logger.log(`registered skills: ${this.skillRegistry.getAll().map(s => s.id).join(', ')}`);
      if (body.mode === 'skill' && resolvedSkillId) {
        const skill = this.skillRegistry.get(resolvedSkillId);
        this.logger.log(`skill lookup result: ${skill ? skill.id : 'NOT FOUND'}`);
        if (skill) {
          await finishStream(skill.stream(userMessage, history, user.id));
          return response.end();
        }
        // 技能未注册，降级为普通聊天
      }

      // 默认：转发到 Python ai-engine 纯 LLM 流
      let plainSessionId = chatId;
      for await (const ev of this.aiEngine.streamPlainChat(chatId, userMessage)) {
        if (ev.type === 'text' && ev.content) {
          response.write(`data: ${JSON.stringify({ content: ev.content })}\n\n`);
          answer += ev.content;
        } else if (ev.type === 'done') {
          plainSessionId = ev.session_id ?? chatId;
        } else if (ev.type === 'error') {
          throw new Error(ev.message ?? 'AI Engine 返回错误');
        }
      }
      await this.database.appendUserChatExchange(
        user.id, chatId, rawMessage, answer, 'agnes-2.5-flash',
        body.mode, resolvedSkillId,
      );
      await this.database.recordUserGenerationRequest(
        requestId, user.id, 'chat', Date.now() - startedAt, 'success',
      );
      response.write('event: done\ndata: {}\n\n');
      response.end();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '模型请求失败';
      await this.database.recordUserGenerationRequest(
        requestId, user.id, 'chat', Date.now() - startedAt, 'error', errorMessage,
      );
      response.write(`event: error\ndata: ${JSON.stringify({ message: errorMessage })}\n\n`);
      response.end();
    }
  }

}
