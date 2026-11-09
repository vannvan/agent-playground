import client, { unwrap } from './http'

// ── Types ────────────────────────────────────────────────────────────────────

export const CONVERSATION_MODE = {
  CHAT:  'chat',
  SKILL: 'skill',
} as const
export type ConversationMode = typeof CONVERSATION_MODE[keyof typeof CONVERSATION_MODE]

export interface ChatRequest {
  message: string
  chatId?: string
  mode: ConversationMode
  skillId?: string
}

// ── SSE Event types ─────────────────────────────────────────────────────────

export interface SseEvent {
  type: 'text' | 'tool' | 'tool_result' | 'sources' | 'done' | 'error' | 'clarify'
  content?: string
  name?: string
  args?: string
  session_id?: string
 message?: string
  status?: string
  sources?: Array<{ source: string; content: string; score?: number }>
}

/**
 * 解析服务端 SSE 流，按 event/data 行识别事件类型。
 * 支持两种格式：
 *   event: tool\ndata: {...}
 *   data: {...}  (text chunk)
 */
export async function parseSseStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: (ev: SseEvent) => void,
): Promise<void> {
  const decoder = new TextDecoder()
  let buffer = ''
  const consume = (part: string) => {
    const trimmed = part.trim()
    if (!trimmed) return
    let eventType = 'data'
    let dataLine = ''
    for (const line of trimmed.split('\n')) {
      if (line.startsWith('event:')) eventType = line.slice(6).trim()
      else if (line.startsWith('data:')) dataLine = line.slice(5).trim()
    }
    if (!dataLine) return
    try {
      const ev = JSON.parse(dataLine) as SseEvent
      if (eventType !== 'data') ev.type = eventType as SseEvent['type']
      else if (!ev.type) ev.type = ev.content !== undefined ? 'text' : 'done'
      onEvent(ev)
    } catch {
      // 忽略非法 SSE 数据帧
    }
  }
  try {
    while (true) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''
      parts.forEach(consume)
      if (done) {
        if (buffer.trim()) consume(buffer)
        break
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// ── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  me:     () => unwrap(client.get<{ user: import('../types').User } | null>('/auth/me')),
  login:  (e: string, p: string) => unwrap(client.post<{ user: import('../types').User }>('/auth/login', { email: e, password: p })),
  signup: (e: string, p: string) => unwrap(client.post<{ user: import('../types').User }>('/auth/signup', { email: e, password: p })),
  logout: () => client.post('/auth/logout'),
}

// ── Chats ────────────────────────────────────────────────────────────────────
export const chatsApi = {
  list:     () => unwrap(client.get<import('../types').ChatSession[]>('/chats')),
  create:   () => unwrap(client.post<import('../types').ChatSession>('/chats')),
  open:     (id: string) => unwrap(client.get<{ messages: import('../types').ChatMessage[]; chatId: string }>(`/chats/${id}`)),
  delete:   (id: string) => client.delete(`/chats/${encodeURIComponent(id)}`),
}

// ── Chat streaming ───────────────────────────────────────────────────────────
export async function sendChatMessage(
  prompt: string,
  chatId: string,
  opts?: { mode?: ConversationMode; skillId?: string },
): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  const mode     = opts?.mode     ?? CONVERSATION_MODE.CHAT
  const skillId  = opts?.skillId
  const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'}/chat`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: prompt, chatId, mode, skillId }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`)
  }
  if (!res.body) throw new Error('响应体为空')
  return res.body.getReader()
}

// ── Images ───────────────────────────────────────────────────────────────────
export const imagesApi = {
  list:     () => unwrap(client.get<import('../types').GeneratedImage[]>('/images')),
  generate: (prompt: string, size: string) => unwrap(client.post<{ id: string; url: string }>('/images/generations', { prompt, size })),
}

// ── Model Config ─────────────────────────────────────────────────────────────
export const modelConfigApi = {
  get:    () => unwrap(client.get<Omit<import('../types').ModelConfig, 'apiKey'>>('/model-config')),
  save:   (c: Pick<import('../types').ModelConfig, 'apiKey' | 'baseUrl' | 'textModel' | 'imageModel' | 'videoModel'>) =>
            unwrap(client.put<import('../types').ModelConfig>('/model-config', c)),
  test:   (c: Pick<import('../types').ModelConfig, 'apiKey' | 'baseUrl' | 'textModel'>) =>
            unwrap(client.post<{ success: boolean; message: string; durationMs?: number }>('/model-config/test', c)),
}

// ── Announcements ────────────────────────────────────────────────────────────
export const announcementsApi = {
  list:    () => unwrap(client.get<import('../types').SystemAnnouncement[]>('/announcements')),
  dismiss: (id: number) => client.post(`/announcements/${id}/dismiss`),
}

// ── Rewrites ─────────────────────────────────────────────────────────────────
export const rewritesApi = {
  history:      () => unwrap(client.get<import('../types').RewriteHistoryItem[]>('/rewrites/history')),
  authors:      () => unwrap(client.get<{ authors: Array<{ id: string; name: string; articleCount: number }>; knowledgeBaseAvailable: boolean }>('/rewrites/authors')),
  open:         (id: string) => unwrap(client.get<import('../types').RewriteHistoryItem & { constraints: string; article: string; model: string }>(`/rewrites/${encodeURIComponent(id)}`)),
  generate:     (payload: { author: string; topic: string; constraints: string; targetLength: number }) =>
                  client.post('/rewrites/generate', payload, { responseType: 'stream' }).then(r => r.data.getReader()),
  review:       (payload: { draft: string; author?: string; ignoredIssueKeys: string[] }) =>
                  unwrap(client.post<any>('/rewrites/review', payload)),
}

// ── RAG ──────────────────────────────────────────────────────────────────────
export const ragApi = {
  listDocuments:  () => unwrap(client.get<Array<{ id: string; name: string; type: 'pdf' | 'md' | 'txt'; size: number; chunkSize: number; chunkCount: number; createdAt: string }>>('/rag/documents')),
  uploadFiles:    (files: File[], chunkSize: number) => {
    const form = new FormData()
    files.forEach((f) => form.append('files', f, f.name))
    return client.post(`/rag/documents?chunkSize=${encodeURIComponent(chunkSize)}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  deleteDocument: (id: string) => unwrap(client.delete<{ message?: string }>(`/rag/documents/${encodeURIComponent(id)}`)),
  ask:            (question: string, topK: number, rerank: boolean) =>
                    unwrap(client.post<any>('/rag/ask', { question, topK, rerank })),
}

// ── Suggestions ──────────────────────────────────────────────────────────────
export const suggestionsApi = {
  get: () => unwrap(client.get<{ questions: string[] }>('/ai-engine/suggestions')),
}
