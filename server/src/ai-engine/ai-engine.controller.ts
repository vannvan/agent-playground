import { Controller, Post, Body, Res, Get, Request as NestReq, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { SessionAuthGuard } from '../auth/auth.guard';
import type { AuthenticatedRequest } from '../auth/auth.guard';
import { AiEngineService } from './ai-engine.service';

@UseGuards(SessionAuthGuard)
@Controller('api/ai-engine')
export class AiEngineController {
  constructor(private readonly aiEngine: AiEngineService) {}

  @Get('health')
  async health(@NestReq() req: AuthenticatedRequest) {
    const url = `${(process.env.AI_ENGINE_URL ?? 'http://localhost:8000').replace(/\/+$/, '')}/health`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      const data = await res.json() as { status?: string; model?: string; tools?: string[] };
      return { status: res.ok ? 'ok' : 'degraded', engine: data };
    } catch {
      return { status: 'unreachable', engine: null };
    }
  }

  /**
   * 流式知识库对话
   * SSE 格式兼容前端现有解析逻辑：
   *   data: {"content":"..."}          ← 文本片段（透传）
   *   event: tool   data: {...}        ← 工具调用（可选处理）
   *   event: done data: {}             ← 结束
   *   event: error  data: {...}        ← 异常
   */
  @Post('chat/stream')
  async streamChat(
    @Body() body: { message?: string; chatId?: string },
    @Res() response: Response,
    @NestReq() request: AuthenticatedRequest,
  ) {
    const message = body.message?.trim();
    if (!message) throw new Error('请输入问题');
    if (!body.chatId) throw new Error('缺少会话 ID');

    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();

    const sessionId = body.chatId;

    try {
      for await (const event of this.aiEngine.streamChat({ message, session_id: sessionId })) {
        if (event.type === 'text' && event.content) {
          response.write(`data: ${JSON.stringify({ content: event.content })}\n\n`);
        } else if (event.type === 'tool') {
          response.write(`event: tool\ndata: ${JSON.stringify({ name: event.name, args: event.args })}\n\n`);
        } else if (event.type === 'sources') {
          response.write(`event: sources\ndata: ${JSON.stringify({ sources: event.sources ?? [] })}\n\n`);
        } else if (event.type === 'error') {
          response.write(`event: error\ndata: ${JSON.stringify({ message: event.message })}\n\n`);
          response.end();
          return;
        } else if (event.type === 'done') {
          response.write('event: done\ndata: {}\n\n');
          response.end();
          return;
        }
      }
      response.write('event: done\ndata: {}\n\n');
      response.end();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI Engine 请求失败';
      response.write(`event: error\ndata: ${JSON.stringify({ message: msg })}\n\n`);
      response.end();
    }
  }
}
