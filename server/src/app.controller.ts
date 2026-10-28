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
import { ChatOpenAI } from '@langchain/openai';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedRequest } from './auth/auth.guard';
import { SessionAuthGuard } from './auth/auth.guard';
import { DatabaseService } from './database.service';
import { ModelConfigService } from './model-config.service';
import { SkillRouterService } from './skills/skill-router.service';
import { SKILL_REGISTRY, SkillRegistry } from './skills/skill-registry';

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
  private readonly modelConfig: ModelConfigService;
  private readonly skillRegistry: SkillRegistry;

  constructor(
    private readonly database: DatabaseService = new DatabaseService(),
    modelConfig?: ModelConfigService,
    @Inject(SKILL_REGISTRY) skillRegistry?: SkillRegistry,
  ) {
    this.modelConfig = modelConfig ?? new ModelConfigService(this.database);
    this.skillRegistry = skillRegistry ?? new SkillRegistry();
  }

  @UseGuards(SessionAuthGuard)
  @Post('api/images/generations')
  async generateImage(
    @Body() body: {
      prompt?: string;
      size?: string;
    },
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
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, prompt, size, n: 1, response_format: 'url' }),
      });
      const payload = await upstream.json() as {
        data?: Array<{ url?: string; b64_json?: string }>;
        error?: { message?: string };
      };
      if (!upstream.ok) {
        throw new BadGatewayException(
          payload.error?.message || `图像服务请求失败（${upstream.status}）`,
        );
      }

      const image = payload.data?.[0];
      const url = image?.url || (image?.b64_json ? `[image omitted]${image.b64_json}` : undefined);
      if (!url) {
        throw new BadGatewayException('图像服务未返回图片，请确认模型支持图片生成');
      }
      const id = randomUUID();
      await this.database.saveUserImage(request.user.id, {
        id,
        prompt,
        size,
        model,
        url,
      });
      await this.database.recordUserGenerationRequest(
        requestId, request.user.id, 'image', Date.now() - startedAt, 'success',
      );
      return { id, url, prompt, size, model };
    } catch (error) {
      await this.database.recordUserGenerationRequest(
        requestId,
        request.user.id,
        'image',
        Date.now() - startedAt,
        'error',
        error instanceof Error ? error.message : '无法连接图像服务',
      );
      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException(
        error instanceof Error ? error.message : '无法连接图像服务',
      );
    }
  }

  @UseGuards(SessionAuthGuard)
  @Post('api/chat')
  async chat(
    @Body() body: {
      message?: string;
      chatId?: string;
      skillId?: string;
    },
    @Res() response: Response,
    @Req() request: AuthenticatedRequest,
  ) {
    const rawMessage = body.message?.trim();
    if (!rawMessage) throw new BadRequestException('请输入问题');
    if (!body.chatId) throw new BadRequestException('缺少会话 ID');

    const user = request.user;
    const chat = await this.database.getUserChat(user.id, body.chatId);
    if (!chat) throw new NotFoundException('会话不存在');

    const history = chat.messages as Array<{ role: 'user' | 'assistant'; content: string }>;
    const privateConfig = await this.modelConfig.getPrivateConfig(user.id);
    const sessionId = body.chatId;

    // ── 检测技能前缀 @技能名，剥离后交给对应技能处理 ──
    const skillMatch = rawMessage.match(/^@([^\s]+)\s*(.*)$/s);
    let skillId: string | null = null;
    let userMessage = rawMessage;
    if (skillMatch) {
      skillId = skillMatch[1]; // e.g. "knowledge-base"
      userMessage = skillMatch[2].trim();
    }

    // 打开 SSE 响应头
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();

    const requestId = randomUUID();
    const startedAt = Date.now();

    let answer = '';
    const finishStream = async (
      reader: AsyncIterable<string>,
      skillIdForDb: string | null,
    ) => {
      for await (const chunk of reader) {
        response.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
        answer += chunk;
      }
      await this.database.appendUserChatExchange(
        user.id, sessionId, rawMessage, answer,
        skillIdForDb ?? privateConfig.textModel,
      );
      await this.database.recordUserGenerationRequest(
        requestId, user.id, 'chat', Date.now() - startedAt, 'success',
      );
      response.write('event: done\ndata: {}\n\n');
    };

    try {
      // 优先走技能路由；未指定或未注册则走普通 LLM
      if (skillId) {
        const skill = this.skillRegistry.get(skillId);
        if (skill) {
          await finishStream(skill.stream(userMessage, history, user.id), skill.id);
          return response.end();
        }
      }

      // 默认：直接调 LLM
      const chunks = await this.streamFromModel(userMessage, privateConfig, history);
      await finishStream(chunks, null);
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

  private async streamFromModel(
    message: string,
    config: { apiKey: string; baseUrl: string; textModel: string },
    history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  ): Promise<AsyncIterable<string>> {
    const model = new ChatOpenAI({
      apiKey: config.apiKey,
      model: config.textModel,
      temperature: 0.7,
      configuration: { baseURL: config.baseUrl },
    });
    const context = history.slice(-20).map((entry) =>
      `${entry.role === 'user' ? '用户' : '助手'}：${entry.content}`,
    ).join('\n');
    const systemPrompt = context
      ? `你是一个简洁、友好的中文助手。请用清晰的 Markdown 回答。以下是本会话此前的对话，请保持上下文连贯：\n${context}`
      : '你是一个简洁、友好的中文助手。请用清晰的 Markdown 回答。';
    const stream = await model.stream([
      ['system', systemPrompt],
      ['human', message],
    ]);
    return (async function* () {
      for await (const chunk of stream) {
        if (typeof chunk.content === 'string' && chunk.content)
          yield chunk.content;
      }
    })();
  }
}
