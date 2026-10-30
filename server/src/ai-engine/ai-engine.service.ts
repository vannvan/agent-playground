import { Injectable, Logger, BadRequestException, ServiceUnavailableException } from '@nestjs/common';

const AI_ENGINE_URL = process.env.AI_ENGINE_URL?.trim() || 'http://localhost:8000';

export interface AiEngineChatInput {
  message: string;
  session_id?: string;
}

export interface AiEngineSseEvent {
  type: 'text' | 'tool' | 'sources' | 'done' | 'error';
  content?: string;
  name?: string;
  args?: string;
  session_id?: string;
  message?: string;
  sources?: Array<{ content: string; source: string; score: number }>;
}

@Injectable()
export class AiEngineService {
  private readonly logger = new Logger(AiEngineService.name);

  /** 流式对话：转发 ai-engine /chat/stream SSE，yield 解析后的事件 */
  async *streamChat(input: AiEngineChatInput): AsyncGenerator<AiEngineSseEvent, void, unknown> {
    const url = `${AI_ENGINE_URL.replace(/\/+$/, '')}/chat/stream`;
    this.logger.log(`代理请求 → ${url}`);

    let body: string;
    try {
      body = JSON.stringify({ message: input.message, session_id: input.session_id ?? null });
    } catch {
      throw new BadRequestException('请求体序列化失败');
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(120_000),
      });
    } catch (err) {
      throw new ServiceUnavailableException(
        `AI Engine 不可达（${AI_ENGINE_URL}）：${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ServiceUnavailableException(
        `AI Engine 返回 HTTP ${res.status}：${text.slice(0, 200)}`,
      );
    }

    const reader = res.body?.getReader();
    if (!reader) throw new ServiceUnavailableException('AI Engine 响应体为空');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          const trimmed = part.trim();
          if (!trimmed) continue;

          const dataMatch = trimmed.match(/^data:\s*(.+)$/m);
          if (!dataMatch?.[1]) continue;

          try {
            const event: AiEngineSseEvent = JSON.parse(dataMatch[1]);
            yield event;
          } catch {
            // 非 JSON 片段忽略
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /** 同步对话（调试用） */
  async chatSync(input: AiEngineChatInput) {
    const url = `${AI_ENGINE_URL.replace(/\/+$/, '')}/chat/sync`;
    const body = JSON.stringify({ message: input.message, session_id: input.session_id ?? null });

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      throw new ServiceUnavailableException(`AI Engine 不可达：${err instanceof Error ? err.message : String(err)}`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ServiceUnavailableException(`AI Engine 返回 HTTP ${res.status}：${text.slice(0, 200)}`);
    }
    return res.json();
  }

  /** 普通聊天流式：转发 ai-engine /chat/plain/stream SSE，yield 解析后的事件 */
  async *streamPlainChat(
    chatId: string,
    message: string,
  ): AsyncGenerator<AiEngineSseEvent, void, unknown> {
    const url = `${AI_ENGINE_URL.replace(/\/+$/, '')}/chat/plain/stream`;
    this.logger.log(`普通聊天代理请求 → ${url}`);

    const body = JSON.stringify({ message, session_id: chatId });

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(120_000),
      });
    } catch (err) {
      throw new ServiceUnavailableException(
        `AI Engine 不可达（${AI_ENGINE_URL}）：${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ServiceUnavailableException(
        `AI Engine 返回 HTTP ${res.status}：${text.slice(0, 200)}`,
      );
    }

    const reader = res.body?.getReader();
    if (!reader) throw new ServiceUnavailableException('AI Engine 响应体为空');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          const trimmed = part.trim();
          if (!trimmed) continue;

          const dataMatch = trimmed.match(/^data:\s*(.+)$/m);
          if (!dataMatch?.[1]) continue;

          try {
            const event: AiEngineSseEvent = JSON.parse(dataMatch[1]);
            yield event;
          } catch {
            // 非 JSON 片段忽略
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
