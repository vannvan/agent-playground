import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Plus,
  Sparkles,
  X,
  Zap,
} from 'lucide-react'
import { Badge, Tooltip } from '@lobehub/ui'
import { Input } from '@lobehub/ui';
import 'streamdown/styles.css'
import { suggestionsApi, sendChatMessage, CONVERSATION_MODE, parseSseStream, type SseEvent } from '../../services/api'
import { normalizeChatMessage } from '../../types'
import type { ChatMessage, ModelConfig, User, GeneratedImage, ChatBlock } from '../../types'
import { ConversationBlocks } from '../../components/chat/ConversationBlocks'


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
      { id: 'image-gen', displayName: '生图', disabled: true, icon: <Plus size={14} /> },
    ],
  },
  {
    name: '自媒体',
    skills: [
      { id: 'copy-gen', displayName: '文案生成', disabled: true, icon: <Copy size={14} /> },
      { id: 'topic-gen', displayName: '内容选题', disabled: true, icon: <Copy size={14} /> },
    ],
  },
]

interface ChatPageProps {
  user: User | null
  activeChatId: string
  onCreateChat: () => Promise<string>
  config: ModelConfig
  selectedSkill: { id: string; displayName: string } | null
  setSelectedSkill: React.Dispatch<React.SetStateAction<{ id: string; displayName: string } | null>>
  error: string
  setError: React.Dispatch<React.SetStateAction<string>>
  isStreaming: boolean
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>
  input: string
  setInput: React.Dispatch<React.SetStateAction<string>>
  messages: ChatMessage[]
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  onOpenSettings: () => void
  onSetSettingsTab: (tab: 'model' | 'profile') => void
  generatedImages: GeneratedImage[]
  previewIndex: number | null
  setPreviewIndex: React.Dispatch<React.SetStateAction<number | null>>
}

export function ChatPage({
  user, activeChatId, onCreateChat, config,
  selectedSkill, setSelectedSkill,
  error, setError, isStreaming, setIsStreaming,
  input, setInput,
  messages, setMessages,
  onOpenSettings, onSetSettingsTab,
  generatedImages,
  previewIndex, setPreviewIndex,
}: ChatPageProps) {
  const chatMessages = messages
  const normalizedMessages = chatMessages.map(normalizeChatMessage)
  const [copiedMessageId, setCopiedMessageId] = useState<string | number | null>(null)
  const [skillPanelOpen, setSkillPanelOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [thinkingTool, setThinkingTool] = useState<string | null>(null)
  const convRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = convRef.current
    if (!el) return
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight })
  }, [chatMessages])

  useEffect(() => {
    if (selectedSkill?.id !== 'knowledge-base' || chatMessages.length > 0) return
    let active = true
    suggestionsApi.get()
      .then((r) => { if (active) setSuggestions(r.questions ?? []) })
      .catch(() => {})
    return () => { active = false }
  }, [selectedSkill?.id, chatMessages.length])

  /** 将 SseEvent 序列转化为 ChatBlock[] */
  function buildBlocks(events: SseEvent[]): ChatBlock[] {
    const blocks: ChatBlock[] = []
    let pendingText = ''

    for (const ev of events) {
      switch (ev.type) {
        case 'tool':
          if (pendingText) {
            blocks.push({ type: 'text', content: pendingText })
            pendingText = ''
          }
          blocks.push({ type: 'tool', tool: ev.name ?? '', args: ev.args ?? '' })
          break
        case 'text':
          pendingText += ev.content ?? ''
          break
        case 'sources':
          for (let i = blocks.length - 1; i >= 0; i--) {
            if (blocks[i].type === 'tool') {
              ;(blocks[i] as Extract<ChatBlock, { type: 'tool' }>).sources =
                (ev.sources ?? []).map((s) => ({
                  file: s.source.split('/').pop() ?? 'unknown',
                  content: s.content,
                }))
              break
            }
          }
          break
        case 'clarify':
          if (pendingText) {
            blocks.push({ type: 'text', content: pendingText })
            pendingText = ''
          }
          blocks.push({ type: 'clarify', question: ev.content ?? '请补充信息', pending: true })
          break
        case 'done':
        case 'error':
          break
      }
    }
    if (pendingText) {
      blocks.push({ type: 'text', content: pendingText })
    }
    return blocks
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault()
    if (!input.trim() || isStreaming) return
    if (!hasCompleteConfig(config)) {
      setError('开始对话前，请先完成模型配置')
      onOpenSettings()
      onSetSettingsTab('model')
      return
    }
    const prompt = input.trim()
    setInput('')
    setError('')
    setIsStreaming(true)
    try {
      const chatId = activeChatId || await onCreateChat()
      const userMessage: ChatMessage = { id: `user-${Date.now()}`, role: 'user', blocks: [{ type: 'text', content: prompt }] }
      const assistantMessage: ChatMessage = { id: `assistant-${Date.now()}`, role: 'assistant', blocks: [] }
      setMessages((current) => [...current, userMessage, assistantMessage])
      const reader = await sendChatMessage(prompt, chatId, {
        mode: selectedSkill ? CONVERSATION_MODE.SKILL : CONVERSATION_MODE.CHAT,
        skillId: selectedSkill?.id,
      })

      const events: SseEvent[] = []
      await parseSseStream(reader, (ev) => {
        if (ev.type === 'error') {
          throw new Error(ev.message ?? '请求失败')
        }
        if (ev.type === 'tool') {
          setThinkingTool(
            ev.name === 'search_knowledge_base' ? '检索知识库'
            : ev.name === 'ask_clarification' ? '等待澄清'
            : ev.name === 'search_recursive' ? '多步检索中'
            : ev.name === 'route_to_other' ? '转接其他能力'
            : ev.name === 'explain_or_run_code' ? '分析代码中'
            : ev.name === 'remember_user_pref' ? '记录偏好'
            : ev.name ?? ''
          )
        }
        events.push(ev)
        const blocks = buildBlocks(events)
        setMessages((current) => current.map((m, i) =>
          i === current.length - 1 ? { ...m, blocks } : m,
        ))
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : '请求失败')
      setThinkingTool(null)
    } finally {
      setIsStreaming(false)
      setThinkingTool(null)
    }
  }

  async function copyMessage(message: ChatMessage) {
    try {
      const text = message.blocks
        .filter((b) => b.type === 'text')
        .map((b) => (b as Extract<ChatBlock, { type: 'text' }>).content)
        .join('\n')
      await navigator.clipboard.writeText(text)
      setCopiedMessageId(message.id)
      setTimeout(() => setCopiedMessageId(null), 1800)
    } catch {
      setError('复制失败，请检查浏览器剪贴板权限')
    }
  }

  const skillPanelRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const handler = (e: MouseEvent) => { if (!el.contains(e.target as Node)) setSkillPanelOpen(false) }
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

  const previewImage = previewIndex === null ? undefined : generatedImages[previewIndex]

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

  if (!user) return null

  return (
    <section className="chat-page">
      <div className="conversation" ref={convRef}>
        {normalizedMessages.length === 0 ? (
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
            {selectedSkill?.id === 'knowledge-base' && suggestions.length > 0 && (
              <ul className="suggestion-chips">
                {suggestions.map((q, i) => (
                  <li key={i}>
                    <Tooltip title={q} placement="top">
                      <button
                        type="button"
                        className="suggestion-chip"
                        onClick={() => { setInput(q); (document.querySelector('textarea') as HTMLTextAreaElement)?.focus() }}
                        disabled={isStreaming}
                      >
                        {q}
                      </button>
                    </Tooltip>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="messages-list">
            {normalizedMessages.map((msg, idx) => {
              if (msg.role === 'user') {
                const text = msg.blocks.find((b) => b.type === 'text')
                const content = (text as Extract<ChatBlock, { type: 'text' }> | undefined)?.content ?? ''
                return (
                  <div key={msg.id} className="message message--user">
                    <div className="user-message-inner">
                      <p>{content}</p>
                    </div>
                  </div>
                )
              }
              const isLast = idx === normalizedMessages.length - 1
              return (
                <div key={msg.id} className="message message--assistant">
                  <div className="assistant-message-inner">
                    <div className="answer">
                      <ConversationBlocks
                        blocks={msg.blocks}
                        isStreaming={isLast && isStreaming}
                        thinkingTool={isLast && isStreaming ? thinkingTool : null}
                      />
                    </div>
                    {msg.blocks.length > 0 && (
                      <div className="assistant-message-actions">
                        <Tooltip title={copiedMessageId === msg.id ? '已复制' : '复制回答'}>
                          <button
                            type="button"
                            onClick={() => void copyMessage(msg)}
                            disabled={!msg.blocks.some((b) => b.type === 'text')}
                            aria-label="复制回答"
                          >
                            {copiedMessageId === msg.id ? <Check size={13} /> : <Copy size={13} />}
                            <span>{copiedMessageId === msg.id ? '已复制' : '复制'}</span>
                          </button>
                        </Tooltip>
                      </div>
                    )}
                  </div>
                  {idx < normalizedMessages.length - 1 && <hr className="msg-divider" />}
                </div>
              )
            })}
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
                    <div style={{ width: '100%' }}>
                      {group.skills.map((skill) => (
                        <button
                          key={skill.id}
                          type="button"
                          style={{ display: "flex", width: '100%', marginBottom: 2 }}
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
         <Input
           onChange={(event) => setInput(event.currentTarget.value)}
           onPressEnter={() => { if (input.trim() && !isStreaming) void sendMessage({ preventDefault: () => {} } as FormEvent) }}

           placeholder={selectedSkill ? `向「${selectedSkill.displayName}」提问…` : '输入你的问题...'}
           autoFocus
           prefix={
             selectedSkill ? (
               <Badge color="purple" style={{ marginRight: 8 }}>{selectedSkill.displayName}</Badge>
             ) : undefined
           }
           suffix={
             <span className="shortcut">⌘ ↵</span>
           }
         />
       </div>
       </div>
        <div className="composer-foot">
          <span>Enter 发送 · Shift + Enter 换行</span>
        </div>
      </form>
      {previewImage && createPortal(
        <div className="lightbox-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setPreviewIndex(null) }}>
          <section className="lightbox-panel" role="dialog" aria-modal="true" aria-label="图片预览">
            <header className="lightbox-header">
              <div className="lightbox-caption">
                <span>IMAGE PREVIEW <i>{previewIndex! + 1} / {generatedImages.length}</i></span>
                <p>{previewImage.prompt}</p>
              </div>
              <div className="lightbox-actions">
                <a href={previewImage.url} download="agnes-ai-image.png" target="_blank" rel="noreferrer" aria-label="下载图片" title="下载图片"><Copy size={17} /></a>
                <button type="button" autoFocus onClick={() => setPreviewIndex(null)} aria-label="关闭预览" title="关闭预览"><X size={19} /></button>
              </div>
            </header>
            <div className="lightbox-stage">
              {generatedImages.length > 1 && <button className="lightbox-nav previous" type="button" onClick={() => setPreviewIndex((current) => current === null ? null : (current - 1 + generatedImages.length) % generatedImages.length)} aria-label="上一张"><ChevronLeft size={22} /></button>}
              <img src={previewImage.url} alt={previewImage.prompt} />
              {generatedImages.length > 1 && <button className="lightbox-nav next" type="button" onClick={() => setPreviewIndex((current) => current === null ? null : (current + 1) % generatedImages.length)} aria-label="下一张"><ChevronRight size={22} /></button>}
            </div>
            <p className="lightbox-shortcut">ESC 关闭 <span>← → 切换图片</span></p>
          </section>
        </div>,
        document.body,
      )}
    </section>
  )
}

function hasCompleteConfig(config: ModelConfig) {
  return Boolean((config.apiKey.trim() || config.hasApiKey) && config.baseUrl.trim() && config.textModel.trim())
}
