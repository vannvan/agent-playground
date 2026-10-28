import client, { unwrap } from './client'

// ── Types ────────────────────────────────────────────────────────────────────
export type UserStatus = 'active' | 'inactive' | 'banned'
export type UserRole = 'user' | 'admin' | 'superadmin'
export interface User {
  id: number; email: string; status: UserStatus; role: UserRole
  createdAt: string; lastLoginAt: string | null
}
export interface AdminInfo { id: number; email: string }
export interface OverviewData {
  enabled: boolean; users: number; activeUsers: number; chats: number
  messages: number; images: number; errors: number; averageDurationMs: number
  activity: Array<{ date: string; chats: number; images: number }>
}
export interface ChatSession {
  id: number; chatId: string; userId: number; userEmail: string
  title: string; messageCount: number; createdAt: string; updatedAt: string
}
export interface ImageRecord {
  id: string; userId: number; userEmail: string; prompt: string; url: string
  size: string; createdAt: string
}
export interface RewriteRecord {
  id: string; userId: number; userEmail: string; author: string; topic: string
  constraints: string; targetLength: number; model: string; article: string
  createdAt: string
}
export interface ParadigmExtract {
  id: string; userId: number; userEmail: string; author: string; source: string
  paradigm: string; createdAt: string
}
export type AnnouncementType = 'info' | 'success' | 'warning' | 'urgent'
export interface Announcement {
  id: number; title: string; message: string; type: AnnouncementType
  isPublished: boolean; isDismissible: boolean
  startsAt: string | null; endsAt: string | null
  createdAt: string; updatedAt: string; dismissCount: number
}

// ── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  me:        () => unwrap(client.get<{ admin: AdminInfo }>('/auth/me')),
  login:     (e: string, p: string) => unwrap(client.post<{ admin: AdminInfo }>('/auth/login', { email: e, password: p })),
  logout:    () => client.post('/auth/logout'),
}

// ── Overview ─────────────────────────────────────────────────────────────────
export const overviewApi = { get: () => unwrap(client.get<OverviewData>('/overview')) }

// ── Users ────────────────────────────────────────────────────────────────────
export const usersApi = {
  list:         () => unwrap(client.get<{ users: User[] }>('/users')),
  updateStatus: (id: number, s: UserStatus) => unwrap(client.put<{ user: User }>(`/users/${id}/status`, { status: s })),
  updateRole:   (id: number, r: UserRole) => unwrap(client.put<{ user: User }>(`/users/${id}/role`, { role: r })),
  delete:       (id: number) => unwrap(client.delete<{ ok: boolean }>(`/users/${id}`)),
}

// ── Admins ───────────────────────────────────────────────────────────────────
export const adminsApi = {
  list:   () => unwrap(client.get<{ admins: AdminInfo[] }>('/admins')),
  create: (e: string, p: string) => unwrap(client.post<{ admin: AdminInfo }>('/admins', { email: e, password: p })),
  delete: (id: number) => unwrap(client.delete<{ ok: boolean }>(`/admins/${id}`)),
}

// ── Sessions ─────────────────────────────────────────────────────────────────
export const sessionsApi = {
  list:    (page = 1) => unwrap(client.get<{ sessions: ChatSession[]; total: number }>('/sessions', { params: { page } })),
  details: (cid: string) => unwrap(client.get<{ chatId: string; messages: Array<{ id: string; role: string; content: string; timestamp: string }> }>(`/sessions/${encodeURIComponent(cid)}`)),
  delete:  (cid: string) => unwrap(client.delete<{ ok: boolean }>(`/sessions/${encodeURIComponent(cid)}`)),
}

// ── Images ───────────────────────────────────────────────────────────────────
export const imagesApi = {
  list:   (page = 1) => unwrap(client.get<{ images: ImageRecord[]; total: number }>('/images', { params: { page } })),
  delete: (id: string) => unwrap(client.delete<{ ok: boolean }>(`/images/${id}`)),
}

// ── Rewrites ─────────────────────────────────────────────────────────────────
export const rewritesApi = {
  list:    (page = 1) => unwrap(client.get<{ rewrites: RewriteRecord[]; total: number }>('/rewrites', { params: { page } })),
  details: (id: string) => unwrap(client.get<RewriteRecord>(`/rewrites/${encodeURIComponent(id)}`)),
  delete:  (id: string) => unwrap(client.delete<{ ok: boolean }>(`/rewrites/${id}`)),
}

// ── Paradigm ─────────────────────────────────────────────────────────────────
export const paradigmApi = {
  list:   (page = 1) => unwrap(client.get<{ items: ParadigmExtract[]; total: number }>('/paradigm', { params: { page } })),
  delete: (id: string) => unwrap(client.delete<{ ok: boolean }>(`/paradigm/${id}`)),
}

// ── Announcements ────────────────────────────────────────────────────────────
export const announcementsApi = {
  list:   () => unwrap(client.get<Announcement[]>('/announcements')),
  create: (data: Partial<Announcement> & { title: string; message: string; type: AnnouncementType }) =>
             unwrap(client.post<Announcement>('/announcements', data)),
  update: (id: number, data: Partial<Announcement>) =>
            unwrap(client.put<Announcement>(`/announcements/${id}`, data)),
  delete: (id: number) => unwrap(client.delete<{ ok: boolean }>(`/announcements/${id}`)),
}
