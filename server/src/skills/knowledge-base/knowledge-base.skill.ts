import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

const ANSWER_SYSTEM_PROMPT = `你是基于内部知识库回答的助手。
给定若干知识片段和用户问题，按以下规则组织回答。

【格式要求】
- 用自然的段落结构回答，禁止用"结果1/结果2"或"①②③"这类条目标题
- 把多个相关片段融合成一个主题段落：同一主题放一段，不同主题分段落
- 每段开头直接陈述结论，不要"根据资料显示"这类引导词
- 默认 3-5 句讲清核心结论；用户明确要求细节时才展开
- 像向同事口头解释，自然、简洁、口语化

【事实规则】
- 只用片段里的事实；片段没提到的不要编造
- 资料确实没有相关内容时，直说"知识库里没有相关信息"，不硬答
- 需要可追溯时可轻量标注（来源：文件名），不打断阅读

【检索不足时，按需调用工具，不硬答】
- 问题模糊、有歧义、缺关键信息 → 调用 ask_clarification 反问澄清，而不是瞎检索
- 一次检索不够、需要查" A 与 B 的关系" → 调用 search_recursive 二次检索
- 知识库里查不到、但能转生图/写作/网页搜索 → 调用 route_to_other 转给其他能力
- 检索到的是代码、且用户问"能不能跑/什么意思" → 调用 explain_or_run_code
- 检索结果足够回答时，不要调用以上任何工具，直接整合回答


【必须遵守的工作流程】
- 用户提问后，你必须先调用 search_knowledge_base 工具检索知识库相关内容
- 只有当检索结果足够时，才整合检索片段回答问题；禁止直接凭训练数据作答
- 若搜索结果为空（status=no_relevant_result），回复：知识库中没有找到与相关问题相关的信息。
- 不要在未检索的情况下直接回答任何问题
【示例】
✅ 正确（融合 + 口语化 + 直接给结论）：
"CORS 错误通常出现在前后端域名或端口不一致时。解决方法是把前端请求的 base URL 指向后端地址，并在后端开启跨域、配置允许的 origin 列表。"

❌ 错误（条目标题 + 照搬原文）：
"结果1：CORS 错误出现在……
结果2：解决方案是……"
`;

import { SkillBase } from '../skill-base';

/**
 * 知识库问答技能
 * 将请求转发到 ai-engine，以 SSE 形式流式返回结果。
 * 透传 tool/sources 事件供前端展示工具调用过程。
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
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    userId: number,
    chatId?: string,
  ): AsyncIterable<string> {
    const url = `${this.engineUrl.replace(/\/+$/, '')}/chat/stream`;
    this.logger.log(`代理请求 → ${url}`);
    let res: Response;
    try {
      this.logger.log(`skill→Python: session_id=${chatId} (caller-provided) history_len=${history?.length ?? 0} msg="${userMessage.slice(0,80)}"`);
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, session_id: chatId ?? null, system_prompt: ANSWER_SYSTEM_PROMPT, history }),
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

          // 错误事件直接抛出
          const errorMatch = trimmed.match(/^event:\s*error\s*\ndata:\s*(.+)$/m);
          if (errorMatch) {
            try {
              const errData = JSON.parse(errorMatch[1]);
              throw new Error(errData.message ?? 'AI Engine 返回错误');
            } catch (e) {
              throw new Error(e instanceof Error ? e.message : 'AI Engine 返回错误');
            }
          }

          // 工具调用事件：透传 name 和 args，让上游转发给前端
          const toolMatch = trimmed.match(/^event:\s*tool\s*\ndata:\s*(.+)$/m);
          if (toolMatch) {
            try {
              const toolEvent = JSON.parse(toolMatch[1]);
              yield `__TOOL_CALL__${JSON.stringify(toolEvent)}`;
            } catch {
              // 忽略非 JSON 片段
            }
            continue;
          }

          // 来源事件：透传 sources，供前端展示引用
          const sourcesMatch = trimmed.match(/^event:\s*sources\s*\ndata:\s*(.+)$/m);
          if (sourcesMatch) {
            try {
              const sourcesEvent = JSON.parse(sourcesMatch[1]);
              yield `__SOURCES__${JSON.stringify(sourcesEvent)}`;
            } catch {
              // 忽略
            }
            continue;
          }

          // 完成事件：捕获 Python session_id，供 Controller 持久化
          const doneMatch = trimmed.match(/^data:\s*\{"type"\s*:\s*"done"\s*,\s*"session_id"\s*:\s*"([^"]+)"\}/);
          if (doneMatch) {
            this.logger.log(`Python session_id: ${doneMatch[1]}`);
            yield `__PY_SESSION_ID__${doneMatch[1]}`;
            continue;
          }

          // 正常数据事件
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
