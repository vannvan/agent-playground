import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ShieldCheck, ShieldPlus, Trash2, X } from 'lucide-react'
import { request, formatDate, initials } from '../helpers'

type AdminAccount = { id: number; email: string; createdAt: string; lastLoginAt: string | null }
type Dialog = { kind: 'create-admin' | 'reset-admin'; id?: number; email?: string } | null

export default function AdminManage() {
  const [admins, setAdmins] = useState<AdminAccount[]>([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [dialogEmail, setDialogEmail] = useState('')
  const [dialogPassword, setDialogPassword] = useState('')
  const [dialogError, setDialogError] = useState('')
  const [dialogBusy, setDialogBusy] = useState(false)

  async function loadAdmins() {
    try { setAdmins(await request<AdminAccount[]>('admins')); setError('') }
    catch (e) { setError(e instanceof Error ? e.message : '加载失败') }
  }

  useEffect(() => {
    let active = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAdmins().then(() => { if (active) setError('') }).catch((e) => { if (active) setError(e instanceof Error ? e.message : '加载失败') })
    return () => { active = false }
  }, [])

  function showDialog(nextDialog: NonNullable<Dialog>) {
    setDialog(nextDialog); setDialogEmail(nextDialog.email ?? ''); setDialogPassword(''); setDialogError('')
  }

  async function submitDialog(event: FormEvent) {
    event.preventDefault()
    if (!dialog) return
    setDialogBusy(true); setDialogError('')
    try {
      if (dialog.kind === 'create-admin') await request('admins', { method: 'POST', body: JSON.stringify({ email: dialogEmail, password: dialogPassword }) })
      if (dialog.kind === 'reset-admin') await request(`admins/${dialog.id}/password`, { method: 'PATCH', body: JSON.stringify({ password: dialogPassword }) })
      setDialog(null); await loadAdmins()
      setSuccess(dialog.kind === 'create-admin' ? '管理员添加成功' : '密码重置成功')
    } catch (e) { setDialogError(e instanceof Error ? e.message : '操作失败') }
    finally { setDialogBusy(false) }
  }

  async function removeAdmin(target: AdminAccount) {
    if (!window.confirm(`确定移除管理员 ${target.email} 吗？`)) return
    try {
      await request(`admins/${target.id}`, { method: 'DELETE' }); await loadAdmins()
      setSuccess('管理员已移除')
    } catch (e) { setError(e instanceof Error ? e.message : '删除失败') }
  }

  return (
    <main className="admin-manage">
      {error && <div className="admin-toast-error">{error}<button onClick={() => setError('')}><X size={14} /></button></div>}
      {success && <div className="admin-toast-success">{success}<button onClick={() => setSuccess('')}><X size={14} /></button></div>}
      <section className="admin-panel management-panel">
        <div className="management-heading">
          <div><span>PRIVILEGED ACCESS</span><h2>管理员帐号 <small>{admins.length}</small></h2></div>
          <button className="primary-admin-button" onClick={() => showDialog({ kind: 'create-admin' })}><ShieldPlus size={15} />添加管理员</button>
        </div>
        <div className="admin-account-grid">
          {admins.map(account => (
            <article key={account.id} className="admin-account-card">
              <div className="account-card-top">
                <span className="admin-avatar large">{initials(account.email)}</span>
                <span className="role-tag"><ShieldCheck size={12} />管理员</span>
              </div>
              <h3>{account.email}</h3>
              <p>创建于 {formatDate(account.createdAt)}</p>
              <p>最近登录 {formatDate(account.lastLoginAt)}</p>
              <div className="account-card-actions">
                <button onClick={() => showDialog({ kind: 'reset-admin', id: account.id, email: account.email })}>更改密码</button>
                {account.id !== admins[0]?.id && <button className="danger-quiet" onClick={() => void removeAdmin(account)}><Trash2 size={14} />移除</button>}
              </div>
            </article>
          ))}
        </div>
        <div className="admin-security-note"><ShieldCheck size={17} /><span><b>安全建议</b>管理员密码应至少 14 位。停用或删除管理员将立即撤销其后台访问权限。</span></div>
      </section>
      {dialog && (
        <div className="admin-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setDialog(null) }}>
          <section className="admin-form-modal">
            <header><div><span>ACCOUNT SECURITY</span><h2>{dialog.kind === 'create-admin' ? '添加管理员' : '设置新密码'}</h2></div><button onClick={() => setDialog(null)}><X size={18} /></button></header>
            <form onSubmit={submitDialog}>
              {(dialog.kind === 'create-admin') && <><label>邮箱地址</label><input type="email" required value={dialogEmail} onChange={(e) => setDialogEmail(e.target.value)} placeholder="name@example.com" /></>}
              <label>{dialog.kind === 'create-admin' ? '管理员密码（至少 14 位）' : '管理员密码（至少 14 位）'}</label>
              <input type="password" required minLength={14} value={dialogPassword} onChange={(e) => setDialogPassword(e.target.value)} placeholder="输入安全密码" />
              {dialogError && <p className="admin-error">{dialogError}</p>}
              <footer><button type="button" onClick={() => setDialog(null)}>取消</button><button className="primary-admin-button" disabled={dialogBusy}>{dialogBusy ? '处理中…' : '确认保存'}</button></footer>
            </form>
          </section>
        </div>
      )}
    </main>
  )
}
