import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, MessageSquareText, RefreshCw, Search, Trash2, X } from 'lucide-react'
import { request, formatDate } from '../helpers'
import PageLoading from '../../components/PageLoading'

type AdminChat = { sessionId: string; owner: string | null; label: string; lastActivity: string; messageCount: number; kind: 'chat' | 'legacy' }
type ChatDetail = { session: { sessionId: string; title?: string; owner?: string; model?: string; base_url?: string; api_key_masked?: string }; messages: Array<{ id: number; role: 'user' | 'assistant'; content: string; model?: string; createdAt?: string; created_at?: string }> }

export default function ChatData() {
  const [chats, setChats] = useState<AdminChat[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [selected, setSelected] = useState<ChatDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const loadChats = useCallback(async () => {
    setLoading(true)
    setRefreshing(true)
    try {
      const result = await request<{ items: AdminChat[]; total: number }>(`sessions?search=${encodeURIComponent(search)}&page=${page}&pageSize=12`)
      setChats(result.items); setTotal(result.total)
      setError('')
    } catch (e) { setError(e instanceof Error ? e.message : '加载失败') }
    finally { setRefreshing(false); setLoading(false) }
  }, [search, page])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadChats() }, [loadChats])

  if (loading) return <PageLoading />

  async function openSession(session: AdminChat) {
    try { setSelected(await request<ChatDetail>(`sessions/${encodeURIComponent(session.sessionId)}?kind=${session.kind}`)) }
    catch (e) { setError(e instanceof Error ? e.message : '无法读取会话') }
  }

  async function removeSession(session: AdminChat) {
    if (!window.confirm(`确定删除"${session.label}"及其消息记录吗？此操作不可撤销。`)) return
    try {
      await request(`sessions/${encodeURIComponent(session.sessionId)}?kind=${session.kind}`, { method: 'DELETE' })
      if (selected?.session.sessionId === session.sessionId) setSelected(null)
      await loadChats()
      setSuccess('会话已删除')
    } catch (e) { setError(e instanceof Error ? e.message : '删除失败') }
  }

  return (
    <main className="chat-data">
      {error && <div className="admin-toast-error">{error}<button onClick={() => setError('')}><X size={14} /></button></div>}
      {success && <div className="admin-toast-success">{success}<button onClick={() => setSuccess('')}><X size={14} /></button></div>}
      <section className="admin-panel management-panel">
        <div className="management-heading">
          <div><span>CONVERSATION ARCHIVE</span><h2>历史会话 <small>{total}</small></h2></div>
          <div className="management-actions">
            <label className="admin-search"><Search size={15} /><input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="搜索标题、会话 ID 或用户" /></label>
            <button className="admin-refresh" onClick={() => void loadChats()} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'is-refreshing' : ''} />刷新</button>
          </div>
        </div>
        <div className="admin-table-scroll">
          <table className="admin-data-table">
            <thead><tr><th>会话名称</th><th>归属用户</th><th>记录</th><th>最近活动</th><th>操作</th></tr></thead>
            <tbody>
              {chats.map(chat => (
                <tr key={`${chat.kind}-${chat.sessionId}`} onClick={() => void openSession(chat)}>
                  <td><div className="session-name"><span className="session-type-icon"><MessageSquareText size={15} /></span><span><b>{chat.label || '新对话'}</b><small>{chat.kind === 'legacy' ? '旧版匿名会话' : chat.sessionId}</small></span></div></td>
                  <td>{chat.owner ?? <span className="muted-label">匿名历史</span>}</td>
                  <td>{chat.messageCount} 条</td>
                  <td>{formatDate(chat.lastActivity)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button className="icon-danger" onClick={() => void removeSession(chat)}><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {chats.length === 0 && <div className="admin-empty"><MessageSquareText size={23} /><b>暂无会话记录</b><span>用户创建的聊天记录会显示在这里</span></div>}
        </div>
        <div className="table-pagination">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={14} />上一页</button>
          <span>第 {page} 页 / 共 {Math.ceil(total / 12)} 页</span>
          <button disabled={page * 12 >= total} onClick={() => setPage(p => p + 1)}>下一页<ChevronRight size={14} /></button>
        </div>
      </section>
      {selected && (
        <div className="admin-modal-backdrop chat-detail-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setSelected(null) }}>
          <section className="chat-detail-modal">
            <header>
              <div><span>SESSION TRANSCRIPT</span><h2>{selected.session.title || '会话详情'}</h2></div>
              <button onClick={() => setSelected(null)}><X size={18} /></button>
            </header>
            <div className="transcript-list">
              {selected.messages.map(msg => (
                <div key={msg.id} className={`transcript-item ${msg.role}`}>
                  <span className="transcript-role">{msg.role === 'user' ? '用户' : '助手'}</span>
                  <p>{msg.content}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
