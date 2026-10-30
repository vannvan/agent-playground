import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  ArrowUp,
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Check,
  Copy,
  Database,
  Download,
  ImagePlus,
  Info,
  LoaderCircle,
  LogOut,
  MessageCircle,
  PenLine,
  Plus,
  Settings2,
  Sparkles,
  WandSparkles,
  X,
  BookOpen,
  Zap,
  Palette,
  PenTool,
} from 'lucide-react'
import 'streamdown/styles.css'
import './App.less'
import { RewriteWorkspace } from './features/RewriteWorkspace'
import Select from './components/Select'
import { authApi, chatsApi, imagesApi, modelConfigApi, announcementsApi, rewritesApi, sendChatMessage, CONVERSATION_MODE } from './api/front'

const Streamdown = lazy(() => import('streamdown').then(({ Streamdown: Component }) => ({ default: Component })))

type ModelConfig = { apiKey: string; baseUrl: string; textModel: string; imageModel: string; videoModel: string; hasApiKey: boolean; maskedApiKey?: string }
type WorkspaceMode = 'chat' | 'image' | 'rewrite'
type GeneratedImage = { id: string; url: string; prompt: string }
type SkillDef = { id: string; displayName: string; disabled: boolean; icon: React.ReactNode }
type SkillGroup = { name: string; skills: SkillDef[] }

const SKILL_GROUPS: SkillGroup[] = [
  {
    name: '文档技能',
    skills: [
      { id: 'knowledge-base', displayName: '知识库问答', disabled: false, icon: <BookOpen size={14} /> },
      { id: 'doc-interpret', displayName: '文档解读', disabled: true, icon: <Zap size={14} /> },
    ],
  },
  {
    name: '图片技能',
    skills: [
      { id: 'image-gen', displayName: '生图', disabled: true, icon: <Palette size={14} /> },
    ],
  },
  {
    name: '自媒体',
    skills: [
      { id: 'copy-gen', displayName: '文案生成', disabled: true, icon: <PenTool size={14} /> },
      { id: 'topic-gen', displayName: '内容选题', disabled: true, icon: <PenTool size={14} /> },
    ],
  },
]
type User = { id: number; email: string }
type ChatSession = { chatId: string; title: string }
type ChatMessage = { id: string | number; role: 'user' | 'assistant'; content: string }
type RewriteHistoryItem = { id: string; author: string; topic: string; createdAt: string }
type SystemAnnouncement = { id: number; title: string; message: string; type: 'info' | 'success' | 'warning' | 'urgent'; isDismissible: number | boolean }
const defaultConfig: ModelConfig = { apiKey: '', baseUrl: '', textModel: '', imageModel: '', videoModel: '', hasApiKey: false }

function hasCompleteConfig(config: ModelConfig) {
  return Boolean((config.apiKey.trim() || config.hasApiKey) && config.baseUrl.trim() && config.textModel.trim())
}

function App() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<WorkspaceMode>('chat')
  const [input, setInput] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [copiedMessageId, setCopiedMessageId] = useState<string | number | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [selectedSkill, setSelectedSkill] = useState<{ id: string; displayName: string } | null>(null)
  const [skillPanelOpen, setSkillPanelOpen] = useState(false)
  const [error, setError] = useState('')
  const [user, setUser] = useState<User | null>(null)
  const [isAuthLoading, setIsAuthLoading] = useState(true)
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [config, setConfig] = useState<ModelConfig>(defaultConfig)
  const [draftConfig, setDraftConfig] = useState<ModelConfig>(defaultConfig)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [configError, setConfigError] = useState('')
  const [connectionTestBusy, setConnectionTestBusy] = useState(false)
  const [connectionTestResult, setConnectionTestResult] = useState<{ success: boolean; durationMs?: number; message: string } | null>(null)
  const [chats, setChats] = useState<ChatSession[]>([])
  const [rewrites, setRewrites] = useState<RewriteHistoryItem[]>([])
  const [activeRewriteId, setActiveRewriteId] = useState('')
  const [announcements, setAnnouncements] = useState<SystemAnnouncement[]>([])
  const [activeChatId, setActiveChatId] = useState('')
  const [imagePrompt, setImagePrompt] = useState('')
  const [imageSize, setImageSize] = useState('1024x1024')
  const [imageUrl, setImageUrl] = useState('')
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([])
  const [expandedPromptIds, setExpandedPromptIds] = useState<Set<string>>(() => new Set())
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [isGeneratingImage, setIsGeneratingImage] = useState(false)
  const [imageError, setImageError] = useState('')
  const convRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on message change or mode switch
  useEffect(() => {
    const el = convRef.current
    if (!el) return
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight })
  }, [chatMessages, mode])

  useEffect(() => {
    let active = true
    authApi.me()
      .then((r) => { if (active) setUser(r?.user ?? null) })
      .catch(() => { if (active) setUser(null) })
      .finally(() => { if (active) setIsAuthLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!user) return
    let active = true
    async function loadWorkspace() {
      try {
        const [savedConfig, savedChats, savedImages, savedAnnouncements, savedRewrites] = await Promise.all([
          modelConfigApi.get(),
          chatsApi.list(),
          imagesApi.list(),
          announcementsApi.list(),
          rewritesApi.history(),
        ])
        if (!active) return
        const nextConfig = { ...defaultConfig, ...savedConfig, apiKey: '' }
        setConfig(nextConfig)
        setDraftConfig(nextConfig)
        setChats(savedChats)
        setGeneratedImages(savedImages)
        setAnnouncements(savedAnnouncements)
        setRewrites(savedRewrites)
        setActiveRewriteId(savedRewrites[0]?.id ?? '')
        if (savedImages[0]) {
          setImageUrl(savedImages[0].url)
          setImagePrompt(savedImages[0].prompt)
        }
        if (savedChats[0]) {
          const firstChat = await chatsApi.open(savedChats[0].chatId)
          if (active) {
            setActiveChatId(savedChats[0].chatId)
            setChatMessages(firstChat.messages)
          }
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : '无法读取账户数据')
      }
    }
    void loadWorkspace()
    return () => { active = false }
  }, [user])

  useEffect(() => {
    if (!user) return
    let active = true
    const refreshAnnouncements = async () => {
      try {
        const currentAnnouncements = await announcementsApi.list()
        if (active) setAnnouncements(currentAnnouncements)
      } catch {
        // Keep the last loaded notices visible when a background refresh fails.
      }
    }
    const timer = window.setInterval(() => { void refreshAnnouncements() }, 60_000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [user])

  async function submitAuth(event: FormEvent) {
    event.preventDefault()
    setAuthError('')
    setAuthBusy(true)
    try {
      const result = await (authMode === 'login' ? authApi.login(authEmail, authPassword) : authApi.signup(authEmail, authPassword))
      setUser(result.user ?? null)
      setAuthPassword('')
    } catch (authRequestError) {
      setAuthError(authRequestError instanceof Error ? authRequestError.message : '请求失败，请稍后重试')
    } finally {
      setAuthBusy(false)
    }
  }

  async function signOut() {
    await authApi.logout().catch(() => undefined)
    setUser(null)
    setChats([])
    setRewrites([])
    setActiveRewriteId('')
    setChatMessages([])
    setGeneratedImages([])
    setAnnouncements([])
    setActiveChatId('')
    setConfig(defaultConfig)
    setDraftConfig(defaultConfig)
  }

  async function copyMessage(message: ChatMessage) {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopiedMessageId(message.id)
      window.setTimeout(() => {
        setCopiedMessageId((current) => current === message.id ? null : current)
      }, 1800)
    } catch {
      setError('复制失败，请检查浏览器剪贴板权限')
    }
  }

  async function openChat(chatId: string) {
    const result = await chatsApi.open(chatId)
    setActiveChatId(chatId)
    setChatMessages(result.messages.map((message: ChatMessage) => ({ ...message, id: message.id })))
    setError('')
  }

  // ── Skill helper: close panel on outside click ────────────────────────────
  const skillPanelRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const handler = (e: MouseEvent) => {
      if (!el.contains(e.target as Node)) setSkillPanelOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function selectSkill(skill: SkillDef) {
    if (skill.disabled) return
    setSelectedSkill((prev) => prev?.id === skill.id ? null : { id: skill.id, displayName: skill.displayName })
    setSkillPanelOpen(false)
    setTimeout(() => {
      const ta = document.querySelector('textarea[placeholder="输入你的问题..."]') as HTMLTextAreaElement | null
      ta?.focus()
    }, 50)
  }

  const openRewrite = useCallback(async (rewriteId: string) => {
    const result = await rewritesApi.open(rewriteId)
    return result
  }, [])

  async function createChat() {
    const chat = await chatsApi.create()
    setChats((current) => [chat, ...current])
    setActiveChatId(chat.chatId)
    setChatMessages([])
    setError('')
    return chat.chatId
  }

  async function dismissAnnouncement(announcement: SystemAnnouncement) {
    try {
      await announcementsApi.dismiss(announcement.id)
      setAnnouncements((current) => current.filter((item) => item.id !== announcement.id))
    } catch (dismissError) {
      setError(dismissError instanceof Error ? dismissError.message : '关闭公告失败')
    }
  }

  useEffect(() => {
    if (previewIndex === null) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function handlePreviewKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setPreviewIndex(null)
      if (event.key === 'ArrowLeft') {
        setPreviewIndex((current) => current === null ? null : (current - 1 + generatedImages.length) % generatedImages.length)
      }
      if (event.key === 'ArrowRight') {
        setPreviewIndex((current) => current === null ? null : (current + 1) % generatedImages.length)
      }
    }
    window.addEventListener('keydown', handlePreviewKeyDown)
    return () => {
      window.removeEventListener('keydown', handlePreviewKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [previewIndex, generatedImages.length])

  function updateConfig(field: keyof ModelConfig, value: string) {
    setDraftConfig((current) => ({ ...current, [field]: value }))
    setConnectionTestResult(null)
  }

  async function saveConfig() {
    if (!draftConfig.baseUrl.trim() || !draftConfig.textModel.trim() || !(draftConfig.apiKey.trim() || draftConfig.hasApiKey)) {
      setConfigError('请填写 API Key、Base URL 和文本模型名称')
      return
    }
    try {
      const result = await modelConfigApi.save({
          apiKey: draftConfig.apiKey,
          baseUrl: draftConfig.baseUrl,
          textModel: draftConfig.textModel,
          imageModel: draftConfig.imageModel,
          videoModel: draftConfig.videoModel,
        })
      if (!result.baseUrl || !result.textModel) throw new Error('保存配置失败')
      const nextConfig = { ...defaultConfig, ...result, apiKey: '' }
      setConfig(nextConfig)
      setDraftConfig(nextConfig)
      setConfigError('')
      setConnectionTestResult(null)
      setIsSettingsOpen(false)
    } catch (saveError) {
      setConfigError(saveError instanceof Error ? saveError.message : '保存配置失败')
    }
  }

  async function testModelConnection() {
    setConnectionTestBusy(true)
    setConnectionTestResult(null)
    try {
      const result = await modelConfigApi.test({
          apiKey: draftConfig.apiKey,
          baseUrl: draftConfig.baseUrl,
          textModel: draftConfig.textModel,
        })
      if (result.message) throw new Error(result.message)
      setConnectionTestResult({ success: result.success, message: result.message, durationMs: result.durationMs })
    } catch (testError) {
      setConnectionTestResult({ success: false, message: testError instanceof Error ? testError.message : '连通性测试失败' })
    } finally {
      setConnectionTestBusy(false)
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault()
    if (!input.trim() || isStreaming) return
    if (!hasCompleteConfig(config)) {
      setConfigError('开始对话前，请先完成模型配置')
      setDraftConfig(config)
      setIsSettingsOpen(true)
      return
    }
    const prompt = input.trim()
    setInput('')
    setError('')
    setIsStreaming(true)
    try {
      const chatId = activeChatId || await createChat()
      const userMessage: ChatMessage = { id: `user-${Date.now()}`, role: 'user', content: prompt }
      const assistantMessage: ChatMessage = { id: `assistant-${Date.now()}`, role: 'assistant', content: '' }
      setChatMessages((current) => [...current, userMessage, assistantMessage])
      const reader = await sendChatMessage(prompt, chatId, {
        mode:     selectedSkill ? CONVERSATION_MODE.SKILL : CONVERSATION_MODE.CHAT,
        skillId:  selectedSkill?.id,
      })
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { value, done } = await reader.read()
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''
        for (const event of events) {
          const data = event.match(/^data: (.+)$/m)?.[1]
          const eventError = event.match(/^event: error\ndata: (.+)$/m)?.[1]
          if (eventError) throw new Error(JSON.parse(eventError).message)
          if (data) {
            const content = JSON.parse(data).content ?? ''
            setChatMessages((current) => current.map((message, index) => index === current.length - 1
              ? { ...message, content: message.content + content }
              : message))
          }
        }
        if (done) break
      }
      setChats(await chatsApi.list())
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '请求失败')
    } finally {
      setIsStreaming(false)
    }
  }

  async function generateImage(event: FormEvent) {
    event.preventDefault()
    if (!imagePrompt.trim() || isGeneratingImage) return
    if (!hasCompleteConfig(config)) {
      setConfigError('开始生成前，请先完成模型配置')
      setDraftConfig(config)
      setIsSettingsOpen(true)
      return
    }
    if (!config.imageModel.trim()) {
      setConfigError('请先在模型配置中填写图像模型名称')
      setDraftConfig(config)
      setIsSettingsOpen(true)
      return
    }
    setIsGeneratingImage(true)
    setImageError('')
    setImageUrl('')
    try {
      const result = await imagesApi.generate(imagePrompt.trim(), imageSize)
      if (!result.url) throw new Error('模型没有返回可用的图片')
      setImageUrl(result.url)
      setGeneratedImages((images) => [{ id: result.id, url: result.url, prompt: imagePrompt.trim() }, ...images])
    } catch (requestError) {
      setImageError(requestError instanceof Error ? requestError.message : '图片生成请求失败')
    } finally {
      setIsGeneratingImage(false)
    }
  }

  const previewImage = previewIndex === null ? undefined : generatedImages[previewIndex]

  if (isAuthLoading) {
    return <main className="auth-screen"><div className="auth-loading"><span className="brand-mark"><Sparkles size={18} /></span>
    <LoaderCircle className="spin" size={18} /> 正在确认登录状态…</div>
    </main>
  }

  if (!user) {
    return <main className="auth-screen">
      <section className="auth-card">
        <div className="auth-brand"><span className="brand-mark"><Sparkles size={18} /></span><b>灵感工坊</b><span>AI STUDIO</span></div>
        <p className="eyebrow">YOUR PRIVATE CREATIVE SPACE</p>
        <h1>{authMode === 'login' ? '欢迎回来。' : '开始你的创作。'}</h1>
        <p className="auth-subtitle">登录后即可安全保存对话、图片与个人模型配置。</p>
        <form className="auth-form" onSubmit={submitAuth}>
          <label htmlFor="auth-email">邮箱地址</label>
          <input id="auth-email" type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} autoComplete="email" required placeholder="name@example.com" />
          <label htmlFor="auth-password">密码</label>
          <input id="auth-password" type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} minLength={10} maxLength={200} required placeholder="至少 10 个字符" />
          {authError && <p className="auth-error">{authError}</p>}
          <button type="submit" disabled={authBusy}>{authBusy ? <LoaderCircle className="spin" size={16} /> : null}{authMode === 'login' ? '登录' : '创建账户'}</button>
        </form>
        <p className="auth-switch">{authMode === 'login' ? '还没有账户？' : '已经有账户？'} <button type="button" onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setAuthError('') }}>{authMode === 'login' ? '立即注册' : '返回登录'}</button></p>
        <div className="auth-security"><span />密码采用安全哈希保存 · 模型密钥加密存储</div>
      </section>
    </main>
  }

  return (
    <>
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Sparkles size={16} />
          </span>
          <strong>灵感工坊</strong>
          <span className="version">AI STUDIO</span>
        </div>
        <div className="sidebar-section-label">创作工具</div>
        <nav className="mode-nav" aria-label="创作模式">
          <button className={mode === 'chat' ? 'mode-link active' : 'mode-link'} type="button" onClick={() => setMode('chat')}>
            <MessageCircle size={18} />
            <span>AI 聊天</span>
            {/* <span className="nav-shortcut">01</span> */}
          </button>
          <button className={mode === 'image' ? 'mode-link active' : 'mode-link'} type="button" onClick={() => setMode('image')}>
            <ImagePlus size={18} />
            <span>AI 生图</span>
            {/* <span className="nav-shortcut">02</span> */}
          </button>
          <button className={mode === 'rewrite' ? 'mode-link active' : 'mode-link'} type="button" onClick={() => setMode('rewrite')}>
            <PenLine size={18} />
            <span>AI 仿写</span>
          </button>
        </nav>
        <button className="mode-link review-route-link" type="button" onClick={() => navigate('/review')}>
          <WandSparkles size={18} />
          <span>稿件润色评审</span>
        </button>
        <button className="mode-link review-route-link" type="button" onClick={() => navigate('/rag')}>
          <Database size={18} />
          <span>知识库问答</span>
        </button>
        {mode === 'chat' && <section className="chat-history">
          <div className="chat-history-heading"><span>最近对话</span><button type="button" aria-label="新建对话" title="新建对话" onClick={() => { void createChat().catch((createError) => setError(createError.message)) }}><Plus size={15} /></button></div>
          <div className="chat-history-list">
            {chats.map((chat) => <button key={chat.chatId} type="button" className={chat.chatId === activeChatId ? 'chat-history-item active' : 'chat-history-item'} onClick={() => { void openChat(chat.chatId).catch((openError) => setError(openError.message)) }}>
              <MessageCircle size={14} /><span>{chat.title || '新对话'}</span>
            </button>)}
            {chats.length === 0 && <p className="chat-history-empty">你的对话会显示在这里</p>}
          </div>
        </section>}
        {mode === 'rewrite' && <section className="chat-history">
          <div className="chat-history-heading"><span>最近仿写</span><button type="button" aria-label="新建仿写" title="新建仿写" onClick={() => setActiveRewriteId('')}><Plus size={15} /></button></div>
          <div className="chat-history-list">
            {rewrites.map((rewrite) => <button key={rewrite.id} type="button" className={rewrite.id === activeRewriteId ? 'chat-history-item active' : 'chat-history-item'} onClick={() => setActiveRewriteId(rewrite.id)}>
              <PenLine size={14} /><span>{rewrite.author} · {rewrite.topic}</span>
            </button>)}
            {rewrites.length === 0 && <p className="chat-history-empty">生成的文章会显示在这里</p>}
          </div>
        </section>}
       
        <div className="sidebar-bottom">
          <button className="sidebar-model-settings" type="button" onClick={() => { setDraftConfig({ ...config, apiKey: '' }); setConfigError(''); setIsSettingsOpen(true) }} aria-label="模型配置" title="模型配置">
            <Settings2 size={16} /><span>模型配置</span>
          </button>
          <div className="sidebar-foot">
            <span className="status-dot" />
            <span className="sidebar-user-email" title={user.email}>{user.email}</span>
            <button className="logout-button" type="button" onClick={() => { void signOut() }} aria-label="退出登录" title="退出登录"><LogOut size={14} /></button>
          </div>
        </div>
      </aside>
      <section className="chat-panel">
        <header className="topbar">
          <div>
            <span className="eyebrow">AI CREATIVE STUDIO</span>
            <h2>{mode === 'chat' ? 'AI 聊天' : mode === 'image' ? 'AI 生图' : 'AI 仿写'}</h2>
          </div>
          <div className="connection">
            <span className="status-dot" /> Agnes AI <span className="online">READY</span>
          </div>
        </header>
        {announcements.length > 0 && <section className="system-announcements" aria-label="系统公告" aria-live="polite">
          {announcements.map((announcement) => {
            const AnnouncementIcon = announcement.type === 'urgent' || announcement.type === 'warning'
              ? AlertTriangle
              : announcement.type === 'success' ? CheckCircle2 : announcement.type === 'info' ? Info : Bell
            return <article className={`system-announcement ${announcement.type}`} key={announcement.id}>
              <span className="announcement-icon"><AnnouncementIcon size={17} /></span>
              <div className="announcement-copy"><strong>{announcement.title}</strong><p>{announcement.message}</p></div>
              {(announcement.isDismissible === true || announcement.isDismissible === 1) && <button type="button" onClick={() => void dismissAnnouncement(announcement)} aria-label={`关闭公告：${announcement.title}`}><X size={16} /></button>}
            </article>
          })}
        </section>}
        {isSettingsOpen && createPortal(
          <div className="settings-panel" role="dialog" aria-label="模型配置">
            <div className="settings-heading">
              <div>
                <span className="eyebrow">SESSION CONFIG</span>
                <h3>模型连接</h3>
              </div>
              <button className="icon-button" type="button" aria-label="关闭配置" onClick={() => {
                setDraftConfig(config)
                setConfigError('')
                setIsSettingsOpen(false)
              }}>
                <X size={17} />
              </button>
            </div>
            <label>
              API Key
              <input  value={draftConfig.apiKey} onChange={(event) => updateConfig('apiKey', event.target.value)} placeholder={config.hasApiKey ? `已保存 ${config.maskedApiKey ?? '密钥'}，输入新值可替换` : '填写服务商提供的 API Key'} autoComplete="new-password" />
            </label>
            <label>
              Base URL
              <input value={draftConfig.baseUrl} onChange={(event) => updateConfig('baseUrl', event.target.value)} placeholder="填写 OpenAI 兼容接口根地址" />
            </label>
            <label>
              文本模型名称
              <input value={draftConfig.textModel} onChange={(event) => updateConfig('textModel', event.target.value)} placeholder="例如：服务商提供的文本模型 ID" />
            </label>
            <label>
              图像模型名称（可选）
              <input value={draftConfig.imageModel} onChange={(event) => updateConfig('imageModel', event.target.value)} placeholder="填写服务商提供的图像模型 ID" />
            </label>
            <label>
              视频模型名称（可选）
              <input value={draftConfig.videoModel} onChange={(event) => updateConfig('videoModel', event.target.value)} placeholder="填写服务商提供的视频模型 ID" />
            </label>
            {configError && <p className="settings-error">{configError}</p>}
            {connectionTestResult && <p className={connectionTestResult.success ? 'connection-test-result success' : 'connection-test-result failure'} role="status">
              {connectionTestResult.message}{connectionTestResult.durationMs !== undefined && ` · ${connectionTestResult.durationMs} ms`}
            </p>}
            <button className="test-connection" type="button" onClick={() => void testModelConnection()} disabled={connectionTestBusy || !(draftConfig.apiKey.trim() || draftConfig.hasApiKey) || !draftConfig.baseUrl.trim() || !draftConfig.textModel.trim()}>
              {connectionTestBusy ? <><LoaderCircle className="spin" size={14} />测试中…</> : '测试文本模型连通性'}
            </button>
            <button className="save-settings" type="button" onClick={saveConfig}>保存配置</button>
            <p className="settings-note">API Key 仅由服务端加密保存。连通性测试会发送一条最小文本请求，可能产生少量费用；图像和视频模型名称仅保存配置，不会在此测试。</p>
          </div>,
          document.body,
        )}
        {mode === 'chat' ? <>
        <div className="conversation" ref={convRef}>
          {chatMessages.length === 0 && (
            <div className="empty-state">
              <div className="orb">
                <Sparkles size={26} />
              </div>
              <p className="eyebrow">START A CONVERSATION</p>
              <h3>
                Ask anything.
                <br />
                <span>Watch it arrive.</span>
              </h3>
              <p className="empty-note">
                每一个回答都会通过 Server-Sent Events
                <br />
                实时抵达你的屏幕。
              </p>
            </div>
          )}
          {chatMessages.map((message, index) => message.role === 'user' ? (
              <>
              <div className="message user-message" key={message.id}>
                  <p>{message.content}</p>
              </div>
              <div className="msg-divider" />
              </>
            ) : <div className="message assistant-message" key={message.id}>
                <div className="answer">
                  <Suspense fallback={<p className="assistant-markdown">{message.content}</p>}>
                    <Streamdown className="assistant-markdown" mode="streaming" shikiTheme={['github-dark', 'github-dark']}
                    // controls={{ code: { copy: false, download: false } }}
                     isAnimating={isStreaming && index === chatMessages.length - 1}
                     >
                      {message.content}
                    </Streamdown>
                  </Suspense>
                  {isStreaming && index === chatMessages.length - 1 && <span className="cursor" aria-label="正在生成" />}
                  <div className="assistant-message-actions">
                    <button type="button" onClick={() => void copyMessage(message)} disabled={!message.content} aria-label={copiedMessageId === message.id ? '已复制回答' : '复制回答'} title={copiedMessageId === message.id ? '已复制' : '复制回答'}>
                      {copiedMessageId === message.id ? <Check size={13} /> : <Copy size={13} />}
                      <span>{copiedMessageId === message.id ? '已复制' : '复制'}</span>
                    </button>
                  </div>
                </div>
              </div>
          )}
          {error && <p className="error chat-error">{error}</p>}
        </div>
        <form className="composer" onSubmit={sendMessage}>
          <div className="input-wrap">
            <div className="skill-input-group" ref={skillPanelRef}>
              <button
                type="button"
                className={`skill-plus-btn${skillPanelOpen ? ' active' : ''}`}
                onClick={() => setSkillPanelOpen((v) => !v)}
                disabled={isStreaming}
                aria-label="选择技能"
                title="选择技能"
              >
                <Plus size={18} />
              </button>
              {skillPanelOpen && (
                <div className="skill-panel">
                  {SKILL_GROUPS.map((group) => (
                    <div className="skill-group" key={group.name}>
                      <div className="skill-group-label">{group.name}</div>
                      <div style={{width:'100%'}}>
                        {group.skills.map((skill) => (
                          <button
                            key={skill.id}
                            type="button"
                            style={{display:"flex",width:'100%',marginBottom:2}}
                            className={`skill-item${skill.disabled ? ' disabled' : ''}${selectedSkill?.id === skill.id ? ' selected' : ''}`}
                            onClick={() => selectSkill(skill)}
                            disabled={skill.disabled}
                            title={skill.disabled ? '暂未开放' : skill.displayName}
                          >
                            <span className="skill-item-icon">{skill.icon}</span>
                            <span className="skill-item-name">{skill.displayName}</span>
                            {skill.disabled && <span className="skill-item-lock">🔒</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={selectedSkill ? `向「${selectedSkill.displayName}」提问…` : '输入你的问题...'}
              rows={1}
              onKeyDown={(event) => {
                const isComposing = event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229
                if (event.key === 'Enter' && !event.shiftKey && !isComposing) {
                  event.preventDefault()
                  void sendMessage(event)
                }
              }}
            />
            {selectedSkill && (
              <span className="skill-chip">
                <BookOpen size={11} />
                <span>{selectedSkill.displayName}</span>
                <button type="button" className="skill-chip-remove" onClick={() => setSelectedSkill(null)} aria-label="取消技能">
                  <X size={10} />
                </button>
              </span>
            )}
            <span className="shortcut">⌘ ↵</span>
            <button
              aria-label={isStreaming ? '正在生成' : '发送'}
              type="submit"
              disabled={!input.trim() || isStreaming}
            >
              {isStreaming ? <LoaderCircle className="spin" size={18} /> : <ArrowUp size={18} />}
            </button>
          </div>
          <div className="composer-foot">
            <span>Enter 发送 · Shift + Enter 换行</span>
          </div>
        </form>
        </> : mode === 'image' ? <div className="image-workspace">
          {/* <div className="image-intro">
            <div>
              <span className="eyebrow">IMAGINE / GENERATE</span>
              <h3>让想象，<em>看得见。</em></h3>
              <p>描述你脑海中的画面，AI 将为你创作一张专属图像。</p>
            </div>
            <span className="image-intro-mark"><Sparkles size={20} /></span>
          </div> */}
          {/* <div className={imageUrl ? 'image-canvas has-image' : 'image-canvas'}>
            {imageUrl ? <button
              className="image-preview-trigger"
              type="button"
              onClick={() => {
                const index = generatedImages.findIndex((image) => image.url === imageUrl)
                if (index >= 0) setPreviewIndex(index)
              }}
              aria-label="放大预览图片"
              title="点击放大预览"
            ><img src={imageUrl} alt={imagePrompt} /></button> : <div className="canvas-placeholder">
              {isGeneratingImage ? <LoaderCircle className="spin" size={28} /> : <>
                <div className="placeholder-art"><span /><span /><span /><ImagePlus size={24} /></div>
                <b>你的作品将在这里呈现</b>
                <small>输入描述词，开始第一次创作</small>
              </>}
              {isGeneratingImage && <><b>正在绘制你的灵感…</b><small>通常需要一些时间，请稍候</small></>}
            </div>}
            {imageUrl && <a className="download-image" href={imageUrl} download="agnes-ai-image.png" target="_blank" rel="noreferrer"><Download size={15} /> 下载图片</a>}
          </div> */}
          {imageError && <p className="image-error">{imageError}</p>}
          <form className="image-composer" onSubmit={generateImage}>
            <label htmlFor="image-prompt">描述你想生成的画面</label>
            <textarea id="image-prompt" value={imagePrompt} onChange={(event) => setImagePrompt(event.target.value)} placeholder="例如：雨后宁静的京都小巷，暖色胶片质感，路面倒映着纸灯笼…" rows={3} />
            <div className="image-composer-bottom">
              <label className="size-select-label" htmlFor="image-size">图片尺寸
                <Select id="image-size" size="compact" wrapperClassName="image-size-select" value={imageSize} onValueChange={setImageSize} options={[
                  { value: '512x512', label: '512 × 512 · 小方图' },
                  { value: '768x768', label: '768 × 768 · 标准方图' },
                  { value: '1024x1024', label: '1024 × 1024 · 高清方图' },
                  { value: '1024x1536', label: '1024 × 1536 · 竖版' },
                  { value: '1536x1024', label: '1536 × 1024 · 横版' },
                  { value: '1024x1792', label: '1024 × 1792 · 长竖版' },
                  { value: '1792x1024', label: '1792 × 1024 · 宽横版' },
                ]} />
              </label>
              <button className="generate-button" type="submit" disabled={!imagePrompt.trim() || isGeneratingImage}>
                {isGeneratingImage ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
                {isGeneratingImage ? '生成中…' : '生成图片'}
              </button>
            </div>
          </form>
          {generatedImages.length > 0 && <section className="image-gallery" aria-label="生成图片画廊">
            <div className="gallery-heading">
              <div><h4>作品画廊</h4><span>本次创作 · {generatedImages.length} 张</span></div>
              <span className="gallery-hint">点击缩略图再次查看</span>
            </div>
            <div className="gallery-grid">
              {generatedImages.map((image, index) => {
                const isPromptExpanded = expandedPromptIds.has(image.id)
                return <article className={image.url === imageUrl ? 'gallery-item selected' : 'gallery-item'} key={image.id}>
                  <button
                    className="gallery-image-button"
                    type="button"
                    onClick={() => {
                      setImageUrl(image.url)
                      setImagePrompt(image.prompt)
                      setImageError('')
                      setPreviewIndex(index)
                    }}
                    aria-label={`预览第 ${generatedImages.length - index} 张图片`}
                    aria-pressed={image.url === imageUrl}
                  >
                    <img src={image.url} alt={image.prompt} />
                    <span className="gallery-preview-hint">点击预览</span>
                  </button>
                  <div className="gallery-prompt">
                    <p className={isPromptExpanded ? 'expanded' : ''}>{image.prompt}</p>
                    {image.prompt.length > 60 && <button
                      type="button"
                      onClick={() => setExpandedPromptIds((current) => {
                        const next = new Set(current)
                        if (next.has(image.id)) next.delete(image.id)
                        else next.add(image.id)
                        return next
                      })}
                      aria-expanded={isPromptExpanded}
                    >{isPromptExpanded ? '收起' : '展开'}</button>}
                  </div>
                </article>
              })}
            </div>
          </section>}
          <div className="image-footer"><span>POWERED BY AGNES AI</span><span>提示：描述越具体，生成效果越贴近你的想象</span></div>
        </div> : <RewriteWorkspace
          history={rewrites}
          activeId={activeRewriteId}
          onSelect={openRewrite}
          onNew={() => setActiveRewriteId('')}
          onCreated={(rewrite) => {
            setRewrites((current) => [rewrite, ...current.filter((item) => item.id !== rewrite.id)].slice(0, 30))
            setActiveRewriteId(rewrite.id)
          }}
        />}
      </section>
    </main>
    {previewImage && createPortal(
      <div className="lightbox-backdrop" onClick={(event) => {
        if (event.target === event.currentTarget) setPreviewIndex(null)
      }}>
        <section className="lightbox-panel" role="dialog" aria-modal="true" aria-label="图片预览">
          <header className="lightbox-header">
            <div className="lightbox-caption">
              <span>IMAGE PREVIEW <i>{previewIndex! + 1} / {generatedImages.length}</i></span>
              <p>{previewImage.prompt}</p>
            </div>
            <div className="lightbox-actions">
              <a href={previewImage.url} download="agnes-ai-image.png" target="_blank" rel="noreferrer" aria-label="下载图片" title="下载图片"><Download size={17} /></a>
              <button type="button" autoFocus onClick={() => setPreviewIndex(null)} aria-label="关闭预览" title="关闭预览"><X size={19} /></button>
            </div>
          </header>
          <div className="lightbox-stage">
            {generatedImages.length > 1 && <button className="lightbox-nav previous" type="button" onClick={() => setPreviewIndex((previewIndex! - 1 + generatedImages.length) % generatedImages.length)} aria-label="上一张"><ChevronLeft size={22} /></button>}
            <img src={previewImage.url} alt={previewImage.prompt} />
            {generatedImages.length > 1 && <button className="lightbox-nav next" type="button" onClick={() => setPreviewIndex((previewIndex! + 1) % generatedImages.length)} aria-label="下一张"><ChevronRight size={22} /></button>}
          </div>
          <p className="lightbox-shortcut">ESC 关闭 <span>← → 切换图片</span></p>
        </section>
      </div>,
      document.body,
    )}
    </>
  )
}

export default App
