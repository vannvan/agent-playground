import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Bell, Megaphone, RefreshCw, Trash2, X } from 'lucide-react'
import Select from '../../components/Select'
import { request, formatDate, isUserActive, announcementStatus } from '../helpers'
import PageLoading from '../../components/PageLoading'

type AnnouncementType = 'info' | 'success' | 'warning' | 'urgent'
type AdminAnnouncement = { id: number; title: string; message: string; type: AnnouncementType; isPublished: number | boolean; isDismissible: number | boolean; startsAt: string | null; endsAt: string | null; createdAt: string; updatedAt: string; dismissCount: number }
type AnnouncementForm = { title: string; message: string; type: AnnouncementType; isPublished: boolean; isDismissible: boolean; startsAt: string; endsAt: string }

const emptyAnnouncement: AnnouncementForm = { title: '', message: '', type: 'info', isPublished: false, isDismissible: true, startsAt: '', endsAt: '' }

export default function AnnouncementManage() {
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [announcementEditor, setAnnouncementEditor] = useState<number | 'new' | null>(null)
  const [announcementForm, setAnnouncementForm] = useState<AnnouncementForm>(emptyAnnouncement)
  const [announcementError, setAnnouncementError] = useState('')
  const [announcementBusy, setAnnouncementBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  async function loadAnnouncements() {
    setLoading(true)
    setRefreshing(true)
    try { setAnnouncements(await request<AdminAnnouncement[]>('announcements')); setError('') }
    catch (e) { setError(e instanceof Error ? e.message : '加载失败') }
    finally { setRefreshing(false); setLoading(false) }
  }

  useEffect(() => {
    let active = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAnnouncements().then(() => { if (active) setError('') }).catch((e) => { if (active) setError(e instanceof Error ? e.message : '加载失败') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  if (loading) return <PageLoading />

  function openAnnouncementEditor(announcement?: AdminAnnouncement) {
    setAnnouncementError('')
    if (!announcement) {
      setAnnouncementForm(emptyAnnouncement)
      setAnnouncementEditor('new')
      return
    }
    setAnnouncementForm({
      title: announcement.title, message: announcement.message, type: announcement.type,
      isPublished: isUserActive(announcement.isPublished), isDismissible: isUserActive(announcement.isDismissible),
      startsAt: announcement.startsAt ? new Date(announcement.startsAt).toISOString().slice(0, 16) : '',
      endsAt: announcement.endsAt ? new Date(announcement.endsAt).toISOString().slice(0, 16) : '',
    })
    setAnnouncementEditor(announcement.id)
  }

  async function submitAnnouncement(event: FormEvent) {
    event.preventDefault()
    setAnnouncementBusy(true)
    setAnnouncementError('')
    try {
      const startsAt = announcementForm.startsAt ? new Date(announcementForm.startsAt).toISOString() : null
      const endsAt = announcementForm.endsAt ? new Date(announcementForm.endsAt).toISOString() : null
      if (startsAt && endsAt && new Date(startsAt) >= new Date(endsAt)) throw new Error('结束时间必须晚于开始时间')
      const payload = { ...announcementForm, startsAt, endsAt }
      if (announcementEditor === 'new') await request('announcements', { method: 'POST', body: JSON.stringify(payload) })
      else if (announcementEditor !== null) await request(`announcements/${announcementEditor}`, { method: 'PATCH', body: JSON.stringify(payload) })
      setAnnouncementEditor(null)
      await loadAnnouncements()
      setSuccess('公告保存成功')
    } catch (e) { setAnnouncementError(e instanceof Error ? e.message : '公告保存失败') }
    finally { setAnnouncementBusy(false) }
  }

  async function toggleAnnouncement(item: AdminAnnouncement) {
    try {
      await request(`announcements/${item.id}`, {
        method: 'PATCH', body: JSON.stringify({
          title: item.title, message: item.message, type: item.type,
          isPublished: !isUserActive(item.isPublished), isDismissible: isUserActive(item.isDismissible),
          startsAt: item.startsAt, endsAt: item.endsAt,
        })
      })
      await loadAnnouncements()
    } catch (e) { setError(e instanceof Error ? e.message : '更新失败') }
  }

  async function removeAnnouncement(item: AdminAnnouncement) {
    if (!window.confirm(`确定删除公告"${item.title}"吗？此操作不可撤销。`)) return
    try {
      await request(`announcements/${item.id}`, { method: 'DELETE' }); await loadAnnouncements()
      setSuccess('公告已删除')
    } catch (e) { setError(e instanceof Error ? e.message : '删除失败') }
  }

  return (
    <main className="announcement-manage">
      {error && <div className="admin-toast-error">{error}<button onClick={() => setError('')}><X size={14} /></button></div>}
      {success && <div className="admin-toast-success">{success}<button onClick={() => setSuccess('')}><X size={14} /></button></div>}
      <section className="admin-panel management-panel announcement-management">
        <div className="management-heading">
          <div><span>PLATFORM MESSAGES</span><h2>系统公告 <small>{announcements.length}</small></h2></div>
          <div className="management-actions">
            <button className="primary-admin-button" onClick={() => openAnnouncementEditor()}><Megaphone size={15} />新建公告</button>
            <button className="admin-refresh" onClick={() => void loadAnnouncements()} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'is-refreshing' : ''} />刷新</button>
          </div>
        </div>
        <div className="announcement-list">
          {announcements.map(item => (
            <article key={item.id} className="announcement-admin-card">
              <div className="announcement-type-icon">{item.type === 'info' ? 'i' : item.type === 'success' ? '✓' : item.type === 'warning' ? '!' : '⚠'}</div>
              <div className="announcement-meta">
                <div><b>{item.title}</b><span className="announcement-status">{announcementStatus(item)}</span></div>
                <p className="announcement-preview">{item.message.slice(0, 100)}{item.message.length > 100 ? '…' : ''}</p>
                <small>创建 {formatDate(item.createdAt)} · 更新 {formatDate(item.updatedAt)} · {item.dismissCount} 次关闭</small>
              </div>
              <div className="announcement-actions">
                <button onClick={() => openAnnouncementEditor(item)}>编辑</button>
                <button onClick={() => void toggleAnnouncement(item)}>{isUserActive(item.isPublished) ? '停用' : '启用'}</button>
                <button className="danger-quiet" onClick={() => void removeAnnouncement(item)}><Trash2 size={14} /></button>
              </div>
            </article>
          ))}
          {announcements.length === 0 && <div className="admin-empty"><Bell size={23} /><b>还没有系统公告</b><span>创建第一条公告来通知用户</span></div>}
        </div>
      </section>
      {announcementEditor !== null && (
        <div className="admin-modal-backdrop announcement-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget && !announcementBusy) setAnnouncementEditor(null) }}>
          <section className="admin-form-modal announcement-form-modal" role="dialog" aria-modal="true" aria-label={announcementEditor === 'new' ? '新建系统公告' : '编辑系统公告'}>
            <header><div><span>PLATFORM MESSAGES</span><h2>{announcementEditor === 'new' ? '新建系统公告' : '编辑系统公告'}</h2></div><button type="button" onClick={() => setAnnouncementEditor(null)}><X size={18} /></button></header>
            <form onSubmit={submitAnnouncement}>
              <label htmlFor="announcement-title">公告标题</label>
              <input id="announcement-title" maxLength={160} required value={announcementForm.title} onChange={(e) => setAnnouncementForm(c => ({ ...c, title: e.target.value }))} placeholder="例如：服务维护通知" />
              <label htmlFor="announcement-message">公告内容</label>
              <textarea id="announcement-message" maxLength={3000} rows={4} required value={announcementForm.message} onChange={(e) => setAnnouncementForm(c => ({ ...c, message: e.target.value }))} placeholder="输入清晰、简洁的公告内容…" />
              <div className="announcement-form-row">
                <div><label htmlFor="announcement-type">公告类型</label><Select id="announcement-type" size="compact" value={announcementForm.type} onValueChange={(v) => setAnnouncementForm(c => ({ ...c, type: v as AnnouncementType }))} options={[{ value: 'info', label: '信息通知' }, { value: 'success', label: '成功提示' }, { value: 'warning', label: '重要提醒' }, { value: 'urgent', label: '紧急通知' }]} /></div>
                <div><label htmlFor="announcement-start">开始展示</label><input id="announcement-start" type="datetime-local" value={announcementForm.startsAt} onChange={(e) => setAnnouncementForm(c => ({ ...c, startsAt: e.target.value }))} /></div>
                <div><label htmlFor="announcement-end">结束展示</label><input id="announcement-end" type="datetime-local" value={announcementForm.endsAt} onChange={(e) => setAnnouncementForm(c => ({ ...c, endsAt: e.target.value }))} /></div>
              </div>
              <div className="announcement-toggles">
                <label><input type="checkbox" checked={announcementForm.isDismissible} onChange={(e) => setAnnouncementForm(c => ({ ...c, isDismissible: e.target.checked }))} /><span><b>用户可关闭</b><small>关闭状态按用户保存</small></span></label>
                <label><input type="checkbox" checked={announcementForm.isPublished} onChange={(e) => setAnnouncementForm(c => ({ ...c, isPublished: e.target.checked }))} /><span><b>立即发布</b><small>未到开始时间时仍会定时展示</small></span></label>
              </div>
              {announcementError && <p className="admin-error">{announcementError}</p>}
              <footer><button type="button" onClick={() => setAnnouncementEditor(null)}>取消</button><button className="primary-admin-button" disabled={announcementBusy}>{announcementBusy ? '保存中…' : '保存公告'}</button></footer>
            </form>
          </section>
        </div>
      )}
    </main>
  )
}
