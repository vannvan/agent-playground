import client, { unwrap } from '../api/client'

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? 'GET'
  const body = init?.body ? JSON.parse(init.body as string) : undefined
  let res: Promise<T>
  switch (method.toUpperCase()) {
    case 'GET':    res = unwrap(client.get<T>(`/${path}`))
                   break
    case 'POST':   res = unwrap(client.post<T>(`/${path}`, body))
                   break
    case 'PUT':    res = unwrap(client.put<T>(`/${path}`, body))
                   break
    case 'PATCH':  res = unwrap(client.patch<T>(`/${path}`, body))
                   break
    case 'DELETE': res = unwrap(client.delete<T>(`/${path}`))
                   break
    default:       res = unwrap(client.get<T>(`/${path}`))
  }
  return res
}

export function formatDate(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function initials(email: string) {
  return email.slice(0, 1).toUpperCase()
}

export function isUserActive(value: number | boolean) {
  return value === true || value === 1
}

export function toDateTimeInput(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export function announcementStatus(item: { isPublished: number | boolean; startsAt: string | null; endsAt: string | null }) {
  if (!isUserActive(item.isPublished)) return '草稿'
  const now = Date.now()
  if (item.startsAt && new Date(item.startsAt).getTime() > now) return '定时发布'
  if (item.endsAt && new Date(item.endsAt).getTime() <= now) return '已过期'
  return '发布中'
}
