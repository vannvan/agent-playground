import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ChevronLeft, ChevronRight, Search, Trash2, UserPlus, Users, X } from 'lucide-react'
import { request, formatDate, initials, isUserActive } from '../helpers'

type AdminUser = { id: number; email: string; isActive: number | boolean; createdAt: string; chatCount: number; imageCount: number }
type Dialog = { kind: 'create-user' | 'reset-user'; id?: number; email?: string } | null

export default function UserManage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [dialogEmail, setDialogEmail] = useState('')
  const [dialogPassword, setDialogPassword] = useState('')
  const [dialogError, setDialogError] = useState('')
  const [dialogBusy, setDialogBusy] = useState(false)

  const loadUsers = useCallback(async () => {
    try {
      const result = await request<{ items: AdminUser[]; total: number }>(`users?search=${encodeURIComponent(search)}&page=${page}&pageSize=12`)
      setUsers(result.items); setTotal(result.total)
      setError('')
    } catch (e) { setError(e instanceof Error ? e.message : '加载失败') }
  }, [search, page])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadUsers() }, [loadUsers])

  async function submitDialog(event: FormEvent) {
    event.preventDefault()
    if (!dialog) return
    setDialogBusy(true); setDialogError('')
    try {
      if (dialog.kind === 'create-user') await request('users', { method: 'POST', body: JSON.stringify({ email: dialogEmail, password: dialogPassword }) })
      if (dialog.kind === 'reset-user') await request(`users/${dialog.id}/password`, { method: 'PATCH', body: JSON.stringify({ password: dialogPassword }) })
      setDialog(null); await loadUsers()
      setSuccess(dialog.kind === 'create-user' ? '用户创建成功' : '密码重置成功')
    } catch (e) { setDialogError(e instanceof Error ? e.message : '操作失败') }
    finally { setDialogBusy(false) }
  }

  async function toggleUser(user: AdminUser) {
    try {
      await request(`users/${user.id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive: !isUserActive(user.isActive) }) })
      await loadUsers()
    } catch (e) { setError(e instanceof Error ? e.message : '更新失败') }
  }

  async function removeUser(user: AdminUser) {
    if (!window.confirm(`确定从用户管理列表移除 ${user.email} 吗？该账户将无法继续登录；聊天会话、系统公告和其他历史数据都会保留。`)) return
    try {
      await request(`users/${user.id}`, { method: 'DELETE' })
      await loadUsers()
      setSuccess('用户已删除；其他历史数据均已保留。')
    } catch (e) { setError(e instanceof Error ? e.message : '删除用户失败') }
  }

  return (
    <main className="user-manage">
      {error && <div className="admin-toast-error">{error}<button onClick={() => setError('')}><X size={14} /></button></div>}
      {success && <div className="admin-toast-success">{success}<button onClick={() => setSuccess('')}><X size={14} /></button></div>}
      <section className="admin-panel management-panel">
        <div className="management-heading">
          <div><span>ACCOUNT DIRECTORY</span><h2>用户账户 <small>{total}</small></h2></div>
          <div className="management-actions">
            <label className="admin-search"><Search size={15} /><input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="搜索邮箱地址" /></label>
            <button className="primary-admin-button" onClick={() => { setDialog({ kind: 'create-user' }); setDialogEmail(''); setDialogPassword(''); setDialogError('') }}><UserPlus size={15} />创建用户</button>
          </div>
        </div>
        <div className="admin-table-scroll">
          <table className="admin-data-table">
            <thead><tr><th>用户</th><th>状态</th><th>聊天</th><th>图片</th><th>注册时间</th><th>账户操作</th></tr></thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id}>
                  <td><div className="table-identity"><span className="admin-avatar">{initials(user.email)}</span><span><b>{user.email}</b><small>UID · {user.id}</small></span></div></td>
                  <td><span className={isUserActive(user.isActive) ? 'status-pill active' : 'status-pill inactive'}><i />{isUserActive(user.isActive) ? '正常' : '已停用'}</span></td>
                  <td>{user.chatCount}</td>
                  <td>{user.imageCount}</td>
                  <td>{formatDate(user.createdAt)}</td>
                  <td>
                    <div className="table-actions">
                      <button onClick={() => { setDialog({ kind: 'reset-user', id: user.id, email: user.email }); setDialogPassword(''); setDialogError('') }}>重置密码</button>
                      <button className={isUserActive(user.isActive) ? 'danger-quiet' : ''} onClick={() => void toggleUser(user)}>{isUserActive(user.isActive) ? '停用' : '启用'}</button>
                      <button className="danger-quiet" onClick={() => void removeUser(user)}><Trash2 size={14} />删除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && <div className="admin-empty"><Users size={23} /><b>还没有匹配的用户</b><span>创建用户或调整搜索条件</span></div>}
        </div>
        <div className="table-pagination">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={14} />上一页</button>
          <span>第 {page} 页 / 共 {Math.ceil(total / 12)} 页</span>
          <button disabled={page * 12 >= total} onClick={() => setPage(p => p + 1)}>下一页<ChevronRight size={14} /></button>
        </div>
      </section>
      {dialog && (
        <div className="admin-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setDialog(null) }}>
          <section className="admin-form-modal">
            <header><div><span>ACCOUNT SECURITY</span><h2>{dialog.kind === 'create-user' ? '创建用户' : '设置新密码'}</h2></div><button onClick={() => setDialog(null)}><X size={18} /></button></header>
            <form onSubmit={submitDialog}>
              {dialog.kind === 'create-user' && <><label>邮箱地址</label><input type="email" required value={dialogEmail} onChange={(e) => setDialogEmail(e.target.value)} placeholder="name@example.com" /></>}
              <label>用户密码（至少 10 位）</label>
              <input type="password" required minLength={10} value={dialogPassword} onChange={(e) => setDialogPassword(e.target.value)} placeholder="输入安全密码" />
              {dialogError && <p className="admin-error">{dialogError}</p>}
              <footer><button type="button" onClick={() => setDialog(null)}>取消</button><button className="primary-admin-button" disabled={dialogBusy}>{dialogBusy ? '处理中…' : '确认保存'}</button></footer>
            </form>
          </section>
        </div>
      )}
    </main>
  )
}
