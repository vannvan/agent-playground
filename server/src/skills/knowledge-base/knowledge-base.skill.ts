import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { SkillBase } from '../skill-base';

/**
 * 知识库问答技能
 * 将请求转发到 ai-engine，以 SSE 形式流式返回结果。
 */
@Injectable()
export class KnowledgeBaseSkill extends SkillBase {
  readonly id = 'knowledge-base';
  readonly displayName = '知识库问答';
  readonly description = '基于已入库文档的检索增强问答';

  private readonly logger = new Logger(KnowledgeBaseSkill.name);
  private readonly engineUrl = process.env.AI_ENGINE_URL ?? 'http://localhost:8000';

  async *stream(
    userMessage: string,
    _history: Array<{ role: 'user' | 'assistant'; content: string }>,
    _userId: number,
  ): AsyncIterable<string> {
    const url = `${this.engineUrl.replace(/\/+$/, '')}/chat/stream`;
    this.logger.log(`代理请求 → ${url}`);

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, session_id: null }),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (err) {
      throw new ServiceUnavailableException(
        `AI Engine 不可达（${this.engineUrl}）：${err instanceof Error ? err.message : String(err)}`,
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
            const event = JSON.parse(dataMatch[1]);
            if (event.type === 'text' && event.content) {
              yield event.content;
            }
          } catch {
            // 忽略非 JSON 片段
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
