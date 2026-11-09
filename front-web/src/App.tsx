import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Bell, CheckCircle2, Info, LoaderCircle, Sparkles, X } from 'lucide-react'
import './styles/App.less'
import { AuthCard } from './components/AuthCard'
import { SettingsPanel } from './components/SettingsPanel'
import { Sidebar } from './components/Sidebar'
import { useWorkspace } from './hooks/useWorkspace'
import { announcementsApi, chatsApi } from './services/api'
import { normalizeChatMessage } from './types'
import type { SystemAnnouncement, ChatMessage, SettingsTab } from './types'
import { ChatPage } from './pages/ChatPage'
import { ImagePage } from './pages/ImagePage'
import { RewritePage } from './pages/RewritePage'
import { confirmModal ,ModalHost} from '@lobehub/ui'

const DEFAULT_CONFIG = {
  apiKey: '',
  baseUrl: '',
  textModel: '',
  imageModel: '',
  videoModel: '',
  hasApiKey: false,
} as const

function App() {
  const navigate = useNavigate()
  const {
    user,
    isAuthLoading,
    config,
    setConfig,
    draftConfig,
    setDraftConfig,
    chats,
    setChats,
    announcements,
    setAnnouncements,
    rewrites,
    setRewrites,
    activeRewriteId,
    setActiveRewriteId,
    generatedImages,
    setGeneratedImages,
    expandedPromptIds,
    setExpandedPromptIds,
    previewIndex,
    setPreviewIndex,
    imageError,
    setImageError,
    signOut,
  } = useWorkspace()

  const [mode, setMode] = useState<'chat' | 'image' | 'rewrite'>('chat')
  const [selectedSkill, setSelectedSkill] = useState<{ id: string; displayName: string } | null>(
    null,
  )
  const [activeChatId, setActiveChatId] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('model')
  const [configError, setConfigError] = useState('')
  const [connectionTestBusy, setConnectionTestBusy] = useState(false)
  const [connectionTestResult, setConnectionTestResult] = useState<{
    success: boolean
    durationMs?: number
    message: string
  } | null>(null)

  useEffect(() => {
    if (!user) return
    const timer = window.setInterval(() => {
      announcementsApi
        .list()
        .then(setAnnouncements)
        .catch(() => {})
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [user, setAnnouncements])

  async function openChat(chatId: string) {
    const result = await chatsApi.open(chatId)
    setChatMessages((result.messages ?? []).map(normalizeChatMessage))
    setActiveChatId(chatId)
  }

  useEffect(() => {
    if (!user || activeChatId || chats.length === 0 || isStreaming) return
    void openChat(chats[0].chatId)
  }, [user, activeChatId, chats, isStreaming])

  async function openRewrite(rewriteId: string) {
    const { rewritesApi } = await import('./services/api')
    return rewritesApi.open(rewriteId)
  }

  async function createChat() {
    const { chatsApi } = await import('./services/api')
    const chat = await chatsApi.create()
    setChats((current) => [chat, ...current])
    setActiveChatId(chat.chatId)
    setChatMessages([])
    return chat.chatId
  }

  async function deleteChat(chatId: string) {
    // if (!window.confirm('确定删除这条会话吗？删除后无法恢复。')) return
    confirmModal({
      title: '确认删除?',
      content: '删除后无法恢复该会话.',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await chatsApi.delete(chatId)
          const remaining = chats.filter((chat) => chat.chatId !== chatId)
          setChats(remaining)
          if (activeChatId !== chatId) return
          const nextChat = remaining[0]
          if (nextChat) {
            await openChat(nextChat.chatId)
          } else {
            setActiveChatId('')
            setChatMessages([])
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : '删除会话失败')
        }
      },
      onCancel: () => {},
    })
  }

  async function dismissAnnouncement(announcement: SystemAnnouncement) {
    try {
      await announcementsApi.dismiss(announcement.id)
      setAnnouncements((current) => current.filter((item) => item.id !== announcement.id))
    } catch {
      setError('关闭公告失败')
    }
  }

  function updateConfig(field: string, value: string) {
    setDraftConfig((current) => ({ ...current, [field]: value }))
    setConnectionTestResult(null)
  }

  async function saveConfig() {
    if (
      !draftConfig.baseUrl.trim() ||
      !draftConfig.textModel.trim() ||
      !(draftConfig.apiKey.trim() || draftConfig.hasApiKey)
    ) {
      setConfigError('请填写 API Key、Base URL 和文本模型名称')
      return
    }
    try {
      const { modelConfigApi } = await import('./services/api')
      const result = await modelConfigApi.save({
        apiKey: draftConfig.apiKey,
        baseUrl: draftConfig.baseUrl,
        textModel: draftConfig.textModel,
        imageModel: draftConfig.imageModel,
        videoModel: draftConfig.videoModel,
      })
      if (!result.baseUrl || !result.textModel) throw new Error('保存配置失败')
      const next = { ...DEFAULT_CONFIG, ...result, apiKey: '' }
      setConfig(next)
      setDraftConfig(next)
      setConfigError('')
      setConnectionTestResult(null)
      setIsSettingsOpen(false)
    } catch (e) {
      setConfigError(e instanceof Error ? e.message : '保存配置失败')
    }
  }

  async function testModelConnection() {
    setConnectionTestBusy(true)
    setConnectionTestResult(null)
    try {
      const { modelConfigApi } = await import('./services/api')
      const result = await modelConfigApi.test({
        apiKey: draftConfig.apiKey,
        baseUrl: draftConfig.baseUrl,
        textModel: draftConfig.textModel,
      })
      if (result.message) throw new Error(result.message)
      setConnectionTestResult({
        success: result.success,
        message: result.message,
        durationMs: result.durationMs,
      })
    } catch (e) {
      setConnectionTestResult({
        success: false,
        message: e instanceof Error ? e.message : '连通性测试失败',
      })
    } finally {
      setConnectionTestBusy(false)
    }
  }

  // 登录成功后刷新页面，让 useWorkspace 重新拉取会话
  function loginSuccess() {
    window.location.href = '/'
  }

  if (isAuthLoading) {
    return (
      <main className="auth-screen">
        <div className="auth-loading">
          <span className="brand-mark">
            <Sparkles size={18} />
          </span>
          <LoaderCircle className="spin" size={18} /> 正在确认登录状态…
        </div>
      </main>
    )
  }

  if (!user) {
    return <AuthCard onLogin={loginSuccess} />
  }

  return (
    <div className="app-shell">
      <ModalHost />
      <Sidebar
        user={user}
        mode={mode}
        setMode={setMode}
        chats={chats}
        activeChatId={activeChatId}
        rewrites={rewrites}
        activeRewriteId={activeRewriteId}
        onSelectChat={openChat}
        onDeleteChat={deleteChat}
        onSelectRewrite={openRewrite}
        onCreateChat={createChat}
        onCreateRewrite={() => setActiveRewriteId('')}
        onOpenSettings={() => {
          setIsSettingsOpen(true)
          setSettingsTab('model')
        }}
        onSignOut={() => {
          void signOut()
          navigate('/')
        }}
        onSetSettingsTab={setSettingsTab}
      />
      <section className="chat-panel">
        <header className="topbar">
          <div>
            {/* <span className="eyebrow">AI CREATIVE STUDIO</span> */}
            <h2>{mode === 'chat' ? '豆奶一下' : mode === 'image' ? 'AI 生图' : 'AI 仿写'}</h2>
          </div>
          {/* <div className="connection">
            <span className="status-dot" /> Agnes AI <span className="online">READY</span>
          </div> */}
        </header>

        {announcements.length > 0 && (
          <section className="system-announcements" aria-label="系统公告" aria-live="polite">
            {announcements.map((announcement) => {
              const AnnouncementIcon =
                announcement.type === 'urgent' || announcement.type === 'warning'
                  ? AlertTriangle
                  : announcement.type === 'success'
                    ? CheckCircle2
                    : announcement.type === 'info'
                      ? Info
                      : Bell
              return (
                <article
                  className={`system-announcement ${announcement.type}`}
                  key={announcement.id}
                >
                  <span className="announcement-icon">
                    <AnnouncementIcon size={17} />
                  </span>
                  <div className="announcement-copy">
                    <strong>{announcement.title}</strong>
                    <p>{announcement.message}</p>
                  </div>
                  {announcement.isDismissible && (
                    <button
                      type="button"
                      onClick={() => void dismissAnnouncement(announcement)}
                      aria-label={`关闭公告：${announcement.title}`}
                    >
                      <X size={16} />
                    </button>
                  )}
                </article>
              )
            })}
          </section>
        )}

        {mode === 'chat' && (
          <ChatPage
            user={user}
            activeChatId={activeChatId}
            onCreateChat={createChat}
            config={config}
            selectedSkill={selectedSkill}
            setSelectedSkill={setSelectedSkill}
            error={error}
            setError={setError}
            isStreaming={isStreaming}
            setIsStreaming={setIsStreaming}
            input={input}
            setInput={setInput}
            messages={chatMessages}
            setMessages={setChatMessages}
            onOpenSettings={() => {
              setIsSettingsOpen(true)
              setSettingsTab('model')
            }}
            onSetSettingsTab={setSettingsTab}
            generatedImages={generatedImages}
            previewIndex={previewIndex}
            setPreviewIndex={setPreviewIndex}
          />
        )}
        {mode === 'image' && (
          <ImagePage
            user={user}
            config={config}
            generatedImages={generatedImages}
            setGeneratedImages={setGeneratedImages}
            expandedPromptIds={expandedPromptIds}
            setExpandedPromptIds={setExpandedPromptIds}
            previewIndex={previewIndex}
            setPreviewIndex={setPreviewIndex}
            imageError={imageError}
            setImageError={setImageError}
            onOpenSettings={() => {
              setIsSettingsOpen(true)
              setSettingsTab('model')
            }}
            onSetSettingsTab={setSettingsTab}
          />
        )}
        {mode === 'rewrite' && (
          <RewritePage
            rewrites={rewrites}
            activeRewriteId={activeRewriteId}
            setRewrites={setRewrites}
            setActiveRewriteId={setActiveRewriteId}
            onOpenSettings={() => {
              setIsSettingsOpen(true)
              setSettingsTab('model')
            }}
            onSetSettingsTab={setSettingsTab}
          />
        )}

        <SettingsPanel
          config={config}
          draftConfig={draftConfig}
          configError={configError}
          connectionTestResult={connectionTestResult}
          connectionTestBusy={connectionTestBusy}
          isSettingsOpen={isSettingsOpen}
          settingsTab={settingsTab}
          onClose={() => {
            setDraftConfig(config)
            setConfigError('')
            setIsSettingsOpen(false)
          }}
          onUpdateConfig={updateConfig}
          onSaveConfig={saveConfig}
          onTestConnection={testModelConnection}
          onSetSettingsTab={setSettingsTab}
        />
      </section>
    </div>
  )
}

export default App
