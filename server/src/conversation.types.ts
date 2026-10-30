/**
 * 统一会话协议 — 区分普通聊天与会话级技能驱动对话
 *
 * 前端和后端共享此约定：
 *   - mode: 'chat'     → 普通 LLM 直连
 *   - mode: 'skill'    → 路由到已注册的技能管线（知识库问答、生图等）
 *
 * skillId 仅在 mode='skill' 时有效，用于标识具体技能。
 * 同一个 chatId 的所有历史消息保持同一 mode，首条请求写入会话元数据，
 * 后续消息自动沿用。
 */

/** 会话模式，前端与后端共用 */
export const CONVERSATION_MODE = {
  CHAT:   'chat',
  SKILL:  'skill',
} as const

export type ConversationMode = typeof CONVERSATION_MODE[keyof typeof CONVERSATION_MODE]

/** 前端 → 后端的聊天请求体 */
export interface ChatRequest {
  /** 用户输入文本 */
  message: string
  /** 可选：复用已有会话 ID（首次创建可省略） */
  chatId?: string
  /** 必填：会话模式 */
  mode: ConversationMode
  /** 可选：技能标识，仅在 mode='skill' 时有效（如 'knowledge-base'） */
  skillId?: string
}

/** 后端返回的会话元信息（供前端更新 UI） */
export interface ChatSessionMeta {
  chatId: string
  title: string
  /** 该会话使用的模式，首条请求后回写 */
  mode: ConversationMode
  /** 该会话绑定的技能 ID（mode='skill' 时） */
  skillId: string | null
}
