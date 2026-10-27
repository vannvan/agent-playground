export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/admin/${path}`, { ...init, credentials: 'include' })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `HTTP ${response.status}`)
  }
  return response.json() as Promise<T>
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
