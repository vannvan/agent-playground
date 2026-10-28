import client, { unwrap } from './client'
import type { AxiosResponse } from 'axios'

// ── Types ────────────────────────────────────────────────────────────────────
export interface User { id: number; email: string }
export interface ModelConfig {
  apiKey: string; baseUrl: string; textModel: string
  imageModel: string; videoModel: string
  hasApiKey: boolean; maskedApiKey?: string
}
export interface ChatSession { chatId: string; title: string }
export interface ChatMessage { id: string | number; role: 'user' | 'assistant'; content: string }
export interface RewriteHistoryItem { id: string; author: string; topic: string; createdAt: string }
export interface SystemAnnouncement {
  id: number; title: string; message: string
  type: 'info' | 'success' | 'warning' | 'urgent'; isDismissible: boolean
}
export interface GeneratedImage { id: string; url: string; prompt: string }
export interface Author { id: string; name: string; articleCount: number }
export interface RewriteDraft extends RewriteHistoryItem {
  constraints: string; article: string; model: string
}
export interface ReviewResult {
  issues: Array<{
    id: string; issueKey: string; severity: 'severe' | 'moderate' | 'polish'
    paragraphIndex: number; lineNumber: number
    originalText: string; replacementText: string
    issue: string; rationale: string; startOffset: number; endOffset: number
  }>
  references: Array<{ author: string; source: string; score: number }>
  methodologyAuthor: string | null
}
export interface IgnoreRecord { key: string; text: string }
export interface RagDocument {
  id: string; name: string; type: 'pdf' | 'md' | 'txt'
  size: number; chunkSize: number; chunkCount: number; createdAt: string
}
export interface RagCitation {
  documentId: string; documentName: string; section: string
  page?: number; chunkId: string
}
export interface RagAnswer {
  answer: string; sources: RagCitation[]
  rewrittenQueries: string[]; reranked: boolean
}

// ── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  me:     () => unwrap(client.get<{ user: User } | null>('/auth/me')),
  login:  (e: string, p: string) => unwrap(client.post<{ user: User }>('/auth/login', { email: e, password: p })),
  signup: (e: string, p: string) => unwrap(client.post<{ user: User }>('/auth/signup', { email: e, password: p })),
  logout: () => client.post('/auth/logout'),
}

// ── Chats ────────────────────────────────────────────────────────────────────
export const chatsApi = {
  list:   () => unwrap(client.get<ChatSession[]>('/chats')),
  create: () => unwrap(client.post<ChatSession>('/chats')),
  open:   (id: string) => unwrap(client.get<{ messages: ChatMessage[]; chatId: string }>(`/chats/${id}`)),
}

// ── Chat streaming ───────────────────────────────────────────────────────────
export async function sendChatMessage(prompt: string, chatId: string) {
  const res: AxiosResponse<ReadableStream> = await client.post('/chat', { message: prompt, chatId }, { responseType: 'stream' })
  return res.data.getReader()
}

// ── Images ───────────────────────────────────────────────────────────────────
export const imagesApi = {
  list:     () => unwrap(client.get<GeneratedImage[]>('/images')),
  generate: (prompt: string, size: string) => unwrap(client.post<{ id: string; url: string }>('/images/generations', { prompt, size })),
}

// ── Model Config ─────────────────────────────────────────────────────────────
export const modelConfigApi = {
  get:    () => unwrap(client.get<Omit<ModelConfig, 'apiKey'>>('/model-config')),
  save:   (c: Pick<ModelConfig, 'apiKey' | 'baseUrl' | 'textModel' | 'imageModel' | 'videoModel'>) =>
            unwrap(client.put<ModelConfig>('/model-config', c)),
  test:   (c: Pick<ModelConfig, 'apiKey' | 'baseUrl' | 'textModel'>) =>
            unwrap(client.post<{ success: boolean; message: string; durationMs?: number }>('/model-config/test', c)),
}

// ── Announcements ────────────────────────────────────────────────────────────
export const announcementsApi = {
  list:    () => unwrap(client.get<SystemAnnouncement[]>('/announcements')),
  dismiss: (id: number) => client.post(`/announcements/${id}/dismiss`),
}

// ── Rewrites ─────────────────────────────────────────────────────────────────
export const rewritesApi = {
  history:      () => unwrap(client.get<RewriteHistoryItem[]>('/rewrites/history')),
  authors:      () => unwrap(client.get<{ authors: Author[]; knowledgeBaseAvailable: boolean }>('/rewrites/authors')),
  open:         (id: string) => unwrap(client.get<RewriteDraft>(`/rewrites/${encodeURIComponent(id)}`)),
  generate:     (payload: { author: string; topic: string; constraints: string; targetLength: number }) =>
                  client.post('/rewrites/generate', payload, { responseType: 'stream' }).then(r => r.data.getReader()),
  review:       (payload: { draft: string; author?: string; ignoredIssueKeys: string[] }) =>
                  unwrap(client.post<ReviewResult & { message?: string | string[] }>('/rewrites/review', payload)),
}

// ── RAG ──────────────────────────────────────────────────────────────────────
export const ragApi = {
  listDocuments:  () => unwrap(client.get<RagDocument[]>('/rag/documents')),
  uploadFiles:    (files: File[], chunkSize: number) => {
    const form = new FormData()
    files.forEach((f) => form.append('files', f, f.name))
    return client.post(`/rag/documents?chunkSize=${encodeURIComponent(chunkSize)}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  deleteDocument: (id: string) => unwrap(client.delete<{ message?: string }>(`/rag/documents/${encodeURIComponent(id)}`)),
  ask:            (question: string, topK: number, rerank: boolean) =>
                    unwrap(client.post<RagAnswer & { message?: string }>('/rag/ask', { question, topK, rerank })),
}
