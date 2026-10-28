import type { Readable } from 'node:stream';

/** 所有技能的抽象基类，每个技能必须实现 stream() */
export abstract class SkillBase {
  /** 技能唯一标识，用于路由匹配（小写，如 'knowledge-base'） */
  abstract readonly id: string;
  /** 技能展示名称，用于 UI 中 @提及 */
  abstract readonly displayName: string;
  /** 技能描述，用于悬浮提示 */
  abstract readonly description: string;

  /**
   * 流式执行技能，yield 文本片段。
   * @param userMessage 用户消息（不含技能前缀，调用方负责剥离）
   * @param history 当前会话历史
   * @param userId 当前用户 ID，供权限/多租户使用
   */
  abstract stream(
    userMessage: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    userId: number,
  ): AsyncIterable<string>;
}
