import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, ArrowUpRight, Clock3, Image, Megaphone, MessageSquareText, ShieldCheck, Users, X } from 'lucide-react'
import { request } from '../helpers'

type AdminOverview = {
  enabled: boolean; users: number; activeUsers: number; chats: number; messages: number
  images: number; errors: number; averageDurationMs: number
  activity: Array<{ date: string; chats: number; images: number }>
}

interface Metric {
  label: string; value: string | number; meta: string
  icon: React.ElementType; tone: 'blue' | 'violet' | 'pink' | 'mint'
}

export default function ControlCenter() {
  const navigate = useNavigate()
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function loadDashboard() {
    try {
      setOverview(await request<AdminOverview>('overview'))
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    }  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadDashboard() }, [])

  const metrics: Metric[] = [
    { label: '注册用户', value: overview?.users ?? '—', meta: `${overview?.activeUsers ?? 0} 位活跃`, icon: Users, tone: 'blue' },
    { label: '聊天会话', value: overview?.chats ?? '—', meta: `${overview?.messages ?? 0} 条消息`, icon: MessageSquareText, tone: 'violet' },
    { label: '生成图片', value: overview?.images ?? '—', meta: '独立图片作品', icon: Image, tone: 'pink' },
    { label: '平均响应', value: overview ? `${Math.round(Number(overview.averageDurationMs))}ms` : '—', meta: `${overview?.errors ?? 0} 次失败请求`, icon: Clock3, tone: 'mint' },
  ]

  return (
    <main>
      {error && <div className="admin-toast-error">{error}<button onClick={() => setError('')}><X size={14} /></button></div>}
      {success && <div className="admin-toast-success">{success}<button onClick={() => setSuccess('')}><X size={14} /></button></div>}
      <section className="admin-welcome">
        <div><span>运营概况 · 最近 7 天</span><h2>让每一份创意，都有迹可循。</h2><p>查看用户增长、内容创作与平台使用情况。</p></div>
        <span className="welcome-art"><Activity size={27} /></span>
      </section>
      <section className="admin-stat-grid">
        {metrics.map(m => (
          <article key={m.label} className="admin-stat-card">
            <div className={`stat-icon ${m.tone}`}><m.icon size={18} /></div>
            <span>{m.label}</span><strong>{m.value}</strong><small>{m.meta}</small>
          </article>
        ))}
      </section>
      {overview && overview.activity.length > 0 && (
        <section className="dashboard-grid">
          <article className="admin-panel activity-panel">
            <div className="panel-heading">
              <div><span>ACTIVITY</span><h3>创作趋势</h3></div>
              <div className="chart-legend"><i className="legend-chat" />聊天 <i className="legend-image" />生图</div>
            </div>
            <div className="activity-chart">
              {overview.activity.map((day) => {
                const chatsValue = Number(day.chats)
                const imageValue = Number(day.images)
                const max = Math.max(1, ...overview.activity.flatMap(e => [Number(e.chats), Number(e.images)]))
                return (
                  <div className="activity-day" key={day.date}>
                    <div className="chart-bars">
                      <span className="bar-chat" style={{ height: `${Math.max(4, chatsValue / max * 100)}%` }} title={`${chatsValue} 次聊天`} />
                      <span className="bar-image" style={{ height: `${Math.max(4, imageValue / max * 100)}%` }} title={`${imageValue} 张图片`} />
                    </div>
                    <small>{new Date(`${day.date}T00:00:00`).toLocaleDateString('zh-CN', { weekday: 'short' })}</small>
                  </div>
                )
              })}
            </div>
            <div className="chart-axis"><span>近 7 天</span><span>每日活动量</span></div>
          </article>
          <article className="admin-panel quick-panel">
            <div className="panel-heading"><div><span>QUICK ACCESS</span><h3>管理入口</h3></div></div>
            {(() => {
              const items = [
                { path: '/admin/users', icon: Users, title: '用户管理', sub: '查看账户状态及使用情况' },
                { path: '/admin/sessions', icon: MessageSquareText, title: '会话管理', sub: '浏览、搜索与清理历史记录' },
                { path: '/admin/admins', icon: ShieldCheck, title: '管理员帐号', sub: '管理后台访问权限' },
                { path: '/admin/announcements', icon: Megaphone, title: '系统公告', sub: '发布平台通知与维护提醒' },
              ]
              return items.map((item, i) => (
                <button key={i} type="button" onClick={() => navigate(item.path)}>
                  <span className={`quick-icon ${['users','sessions','admins','announcements'][i]}`}>
                    <item.icon size={17} />
                  </span>
                  <span><b>{item.title}</b><small>{item.sub}</small></span>
                  <ArrowUpRight size={16} />
                </button>
              ))
            })()}
          </article>
        </section>
      )}
    </main>
  )
}
