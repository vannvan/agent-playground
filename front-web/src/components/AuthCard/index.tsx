import { Sparkles, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { authApi } from '../../services/api'
import type { User } from '../../types'

interface AuthCardProps {
  onLogin: (user: User) => void
}

export function AuthCard({ onLogin }: AuthCardProps) {
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authBusy, setAuthBusy] = useState(false)

  async function submitAuth(event: React.FormEvent) {
    event.preventDefault()
    setAuthError('')
    setAuthBusy(true)
    try {
      const result = await (authMode === 'login'
        ? authApi.login(authEmail, authPassword)
        : authApi.signup(authEmail, authPassword))
      onLogin(result.user)
      setAuthPassword('')
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : '请求失败，请稍后重试')
    } finally {
      setAuthBusy(false)
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark"><Sparkles size={18} /></span>
          <b>灵感工坊</b><span>AI STUDIO</span>
        </div>
        <p className="eyebrow">YOUR PRIVATE CREATIVE SPACE</p>
        <h1>{authMode === 'login' ? '欢迎回来。' : '开始你的创作。'}</h1>
        <p className="auth-subtitle">登录后即可安全保存对话、图片与个人模型配置。</p>
        <form className="auth-form" onSubmit={submitAuth}>
          <label htmlFor="auth-email">邮箱地址</label>
          <input id="auth-email" type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} autoComplete="email" required placeholder="name@example.com" />
          <label htmlFor="auth-password">密码</label>
          <input id="auth-password" type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} minLength={10} maxLength={200} required placeholder="至少 10 个字符" />
          {authError && <p className="auth-error">{authError}</p>}
          <button type="submit" disabled={authBusy}>
            {authBusy ? <LoaderCircle className="spin" size={16} /> : null}
            {authMode === 'login' ? '登录' : '创建账户'}
          </button>
        </form>
        <p className="auth-switch">
          {authMode === 'login' ? '还没有账户？' : '已经有账户？'}
          <button type="button" onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setAuthError('') }}>
            {authMode === 'login' ? '立即注册' : '返回登录'}
          </button>
        </p>
        <div className="auth-security"><span />密码采用安全哈希保存 · 模型密钥加密存储</div>
      </section>
    </main>
  )
}
