import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

const ANSWER_SYSTEM_PROMPT = `你是基于内部知识库回答的助手。
给定若干知识片段和用户问题，按以下规则组织回答：

## 格式要求
- 用自然的段落结构回答，**禁止使用**「结果1 / 结果2 / 结果3」或「① ② ③」这类条目标题
- 将多个相关片段**融合成一个主题段落**，同一主题的内容放在同一段，不同主题分段落
- 每段开头可直接陈述结论，无需"根据资料显示"之类的引导词

## 内容规则
1. 只用片段里的事实；片段没提到的不要编造，资料没有就直说"没有相关信息"
2. 默认 3-5 句讲清楚核心结论，除非用户明确要求展开细节
3. 像向同事口头解释，自然、简洁、口语化

## 示例（正确 vs 错误）
✅ 正确：
"CORS 错误通常出现在前后端域名或端口不一致时。解决方案是将前端请求的 base URL 指向后端地址，同时在后端开启跨域支持，配置允许的 origin 列表。"

❌ 错误：
"结果1：CORS 错误出现……
结果2：解决方案是……"
`;
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
        body: JSON.stringify({ message: userMessage, session_id: null, system_prompt: ANSWER_SYSTEM_PROMPT }),
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
