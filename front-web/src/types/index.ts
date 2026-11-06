/** 统一类型定义 */
export interface User { id: number; email: string }
export interface ModelConfig {
  apiKey: string; baseUrl: string; textModel: string
  imageModel: string; videoModel: string
  hasApiKey: boolean; maskedApiKey?: string
}
export interface ChatSession { chatId: string; title: string }

/** 单次知识库检索来源项 */
export interface SourceItem { file: string; content: string }

/**
 * 消息区块：三种渲染区
 * Zone A · 正文 — 最终回答的 markdown（流式追加）
 * Zone B · 工具过程条 — 调了哪些工具、检索轨迹
 * Zone C · 澄清交互 — ask_clarification 的反问
 */
export type ChatBlock =
  | { type: 'text'; content: string }
  | { type: 'tool'; tool: string; args: string; result?: string; sources?: SourceItem[]; loading?: boolean }
  | { type: 'clarify'; question: string; pending: boolean }

export interface ChatMessage {
  id: string | number
  role: 'user' | 'assistant'
  blocks: ChatBlock[]
}

export function normalizeChatMessage(message: Partial<ChatMessage> & { content?: unknown }): ChatMessage {
  const legacyContent = typeof message.content === 'string' ? message.content : ''
  const blocks = Array.isArray(message.blocks) ? message.blocks : [{ type: 'text' as const, content: legacyContent }]
  return {
    id: message.id ?? 'message-' + Date.now(),
    role: message.role === 'user' ? 'user' : 'assistant',
    blocks,
  }
}
export interface RewriteHistoryItem { id: string; author: string; topic: string; createdAt: string }
export interface SystemAnnouncement {
  id: number; title: string; message: string
  type: 'info' | 'success' | 'warning' | 'urgent'; isDismissible: boolean
}
export interface GeneratedImage { id: string; url: string; prompt: string }
export type WorkspaceMode = 'chat' | 'image' | 'rewrite'
export type SkillDef = { id: string; displayName: string; disabled: boolean; icon: React.ReactNode }
export type SkillGroup = { name: string; skills: SkillDef[] }
