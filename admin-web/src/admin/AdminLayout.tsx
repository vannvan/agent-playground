import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Activity, ArrowLeft, LayoutDashboard, LogOut, Megaphone,
  MessageSquareText, PenLine, RefreshCw, ShieldCheck,
  Image, Users, BookOpen,
} from 'lucide-react'
import { useNavigate, useLocation, Outlet } from 'react-router-dom'
import '../Admin.less'
import { authApi, overviewApi } from '../api/admin'

interface TabItem {
  key: string
  label: string
  icon: React.ReactNode
  path: string
  badge?: (overview: OverviewData | null) => string | null
}
import type { OverviewData, AdminInfo } from '../api/admin'



const TABS: TabItem[] = [
  { key: 'overview', label: '运营看板', icon: <LayoutDashboard size={17} />, path: 'overview',
    badge: (o) => o ? String(o.users) : null },
  { key: 'users', label: '用户管理', icon: <Users size={17} />, path: 'users' },
  { key: 'sessions', label: 'AI 聊天数据', icon: <MessageSquareText size={17} />, path: 'sessions' },
  { key: 'images', label: 'AI 生图数据', icon: <Image size={17} />, path: 'images' },
  { key: 'rewrites', label: 'AI 仿写数据', icon: <PenLine size={17} />, path: 'rewrites' },
  { key: 'paradigm', label: '范式萃取', icon: <BookOpen size={17} />, path: 'paradigm' },
  { key: 'announcements', label: '系统公告', icon: <Megaphone size={17} />, path: 'announcements' },
  { key: 'admins', label: '管理员', icon: <ShieldCheck size={17} />, path: 'admins' },
]

export default function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [admin, setAdmin] = useState<AdminInfo | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    let active = true
    authApi.me()
      .then((r) => { if (active) setAdmin(r.admin) })
      .catch(() => { if (active) setAdmin(null) })
      .finally(() => { if (active) setAuthChecked(true) })
    return () => { active = false }
  }, [])

  // Load overview data (used for badge counts)
  useEffect(() => {
    if (!admin) return
    overviewApi.get()
      .then((r) => setOverview(r))
      .catch(() => {})
  }, [admin])

  async function signIn(event: FormEvent) {
    event.preventDefault()
    setLoginBusy(true); setLoginError('')
    try {
      const result = await authApi.login(emailInput, passwordInput)
      setAdmin(result.admin); setPasswordInput('')
    } catch (e) { setLoginError(e instanceof Error ? e.message : '登录失败') }
    finally { setLoginBusy(false) }
  }

  async function signOut() {
    await authApi.logout().catch(() => undefined)
    setAdmin(null)
  }

  const initials = (email: string) => email.slice(0, 1).toUpperCase()

  if (!authChecked) {
    return <div className="admin-loading"><Activity size={20} /><span>加载中…</span></div>
  }

  if (!admin) {
    return (
      <section className="admin-login">
        <div className="admin-login-card">
          <div className="admin-logo"><Activity size={22} /></div>
          <h1>灵感工坊 · 管理后台</h1>
          <p className="admin-login-copy">仅授权管理员可访问。请使用管理员账户登录。</p>
          <form onSubmit={signIn}>
            <label>邮箱地址</label>
            <input type="email" required value={emailInput} onChange={(e) => setEmailInput(e.target.value)} placeholder="admin@example.com" />
            <label>密码</label>
            <input type="password" required value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} placeholder="输入密码" />
            {loginError && <p className="admin-error">{loginError}</p>}
            <button type="submit" disabled={loginBusy}>登录</button>
          </form>
          <small className="admin-login-foot">管理会话采用 HttpOnly Cookie · 管理操作均记录于数据库</small>
        </div>
      </section>
    )
  }

  const activeTab = TABS.find(t => location.pathname === t.path) || TABS[0]

  return (
    <div className="admin-app">
      <div className="admin-layout">
        <aside className="admin-sidebar">
          <button className="admin-brand" type="button" onClick={() => navigate('/')}>
            <span className="admin-logo"><Activity size={18} /></span>
            <span><b>灵感工坊</b><small>ADMIN CONSOLE</small></span>
          </button>
          <p className="admin-nav-label">工作空间</p>
          <nav>
            {TABS.map(tab => {
              const isActive = location.pathname === tab.path
              const badge = tab.badge ? tab.badge(overview) : null
              return (
                <button
                  key={tab.key}
                  className={`admin-nav-item${isActive ? ' active' : ''}`}
                  onClick={() => navigate(tab.path)}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  {badge !== null && <small>{badge}</small>}
                </button>
              )
            })}
          </nav>
          <div className="admin-sidebar-spacer" />
          <div className="admin-profile">
            <span className="admin-avatar">{initials(admin.email)}</span>
            <span className="admin-profile-info"><b>{admin.email}</b><small>超级管理员</small></span>
            <button type="button" onClick={() => void signOut()} title="退出登录" aria-label="退出登录">
              <LogOut size={16} />
            </button>
          </div>
        </aside>
        <section className="admin-main">
          <header className="admin-topbar">
            <div>
              <button className="admin-back" type="button" onClick={() => navigate('/')}><ArrowLeft size={14} /> 返回创作空间</button>
              <p className="admin-kicker">CONTROL CENTER / {String(TABS.indexOf(activeTab) + 1).padStart(2, '0')}</p>
              <h1>{activeTab.label}</h1>
            </div>
            <div className="admin-top-actions">
              <span className="admin-live"><i />系统在线</span>
              <button
                className="admin-refresh"
                onClick={async () => {
                  setRefreshing(true)
                  try { const r = await overviewApi.get(); setOverview(r) }
                  catch { /* ignore */ }
                  finally { setRefreshing(false) }
                }}
                disabled={refreshing}
              >
                <RefreshCw size={15} className={refreshing ? 'is-refreshing' : ''} />刷新数据
              </button>
              <span className="admin-top-identity">
                <span className="admin-avatar">{initials(admin.email)}</span>
                <b>{admin.email}</b>
              </span>
            </div>
          </header>
           <Outlet />
        </section>
      </div>
    </div>
  )
}
