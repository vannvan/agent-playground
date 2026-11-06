import { useState, useCallback, useRef, useEffect } from 'react'
import type { FormEvent } from 'react'
import { chatsApi, sendChatMessage, CONVERSATION_MODE, parseSseStream, type SseEvent } from '../services/api'
import type { ChatMessage, ChatBlock } from '../types'

export function useChat(activeChatId: string, setChats: (fn: any) => void, _setError: (v: string) => void) {
  const [mode, setMode] = useState<'chat' | 'image' | 'rewrite'>('chat')
  const [input, setInput] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [copiedMessageId, setCopiedMessageId] = useState<string | number | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [selectedSkill, setSelectedSkill] = useState<{ id: string; displayName: string } | null>(null)
  const [skillPanelOpen, setSkillPanelOpen] = useState(false)
  const [error, setErrorState] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [thinkingTool, setThinkingTool] = useState<string | null>(null)
  const convRef = useRef<HTMLDivElement>(null)

  // Auto-scroll
  useEffect(() => {
    const el = convRef.current
    if (!el) return
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight })
  }, [chatMessages, mode])

  // Load suggestions
  useEffect(() => {
    if (selectedSkill?.id !== 'knowledge-base' || chatMessages.length > 0) return
    let active = true
    import('../services/api').then(({ suggestionsApi }) =>
      suggestionsApi.get().then((r) => { if (active) setSuggestions(r.questions ?? []) }).catch(() => {})
    )
    return () => { active = false }
  }, [selectedSkill?.id, chatMessages.length])

  async function createChat() {
    const chat = await chatsApi.create()
    setChats((current: any) => [chat, ...current])
    return chat.chatId
  }

  async function openChat(chatId: string) {
    const result = await chatsApi.open(chatId)
    // 兼容旧格式（content 字段）和新格式（blocks 字段）
    const msgs: ChatMessage[] = (result.messages ?? []).map((m: any) => ({
      id: m.id,
      role: m.role,
      blocks: m.blocks ?? [{ type: 'text' as const, content: m.content ?? '' }],
    }))
    setChatMessages(msgs)
    setErrorState('')
  }

  /** SseEvent[] → ChatBlock[] */
  function buildBlocks(events: SseEvent[]): ChatBlock[] {
    const blocks: ChatBlock[] = []
    let pendingText = ''
    for (const ev of events) {
      switch (ev.type) {
        case 'tool':
          if (pendingText) { blocks.push({ type: 'text', content: pendingText }); pendingText = '' }
          blocks.push({ type: 'tool', tool: ev.name ?? '', args: ev.args ?? '' })
          break
        case 'text':
          pendingText += ev.content ?? ''
          break
        case 'sources':
          for (let i = blocks.length - 1; i >= 0; i--) {
            if (blocks[i].type === 'tool') {
              ;(blocks[i] as Extract<ChatBlock, { type: 'tool' }>).sources =
                (ev.sources ?? []).map((s) => ({ file: s.source.split('/').pop() ?? 'unknown', content: s.content }))
              break
            }
          }
          break
        case 'clarify':
          if (pendingText) { blocks.push({ type: 'text', content: pendingText }); pendingText = '' }
          blocks.push({ type: 'clarify', question: ev.content ?? '请补充信息', pending: true })
          break
        case 'done':
        case 'error':
          break
      }
    }
    if (pendingText) blocks.push({ type: 'text', content: pendingText })
    return blocks
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault()
    if (!input.trim() || isStreaming) return
    const prompt = input.trim()
    setInput('')
    setErrorState('')
    setIsStreaming(true)
    try {
      const chatId = activeChatId || await createChat()
      const userMsg: ChatMessage = { id: `user-${Date.now()}`, role: 'user', blocks: [{ type: 'text', content: prompt }] }
      const aiMsg: ChatMessage = { id: `assistant-${Date.now()}`, role: 'assistant', blocks: [] }
      setChatMessages((current: ChatMessage[]) => [...current, userMsg, aiMsg])
      const reader = await sendChatMessage(prompt, chatId, {
        mode: selectedSkill ? CONVERSATION_MODE.SKILL : CONVERSATION_MODE.CHAT,
        skillId: selectedSkill?.id,
      })
      const events: SseEvent[] = []
      await parseSseStream(reader, (ev) => {
        if (ev.type === 'error') throw new Error(ev.message ?? '请求失败')
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
      })
      const blocks = buildBlocks(events)
      setChatMessages((current: ChatMessage[]) => current.map((m, i) =>
        i === current.length - 1 ? { ...m, blocks } : m
      ))
      const all = await chatsApi.list()
      setChats(all)
    } catch (e) {
      setErrorState(e instanceof Error ? e.message : '请求失败')
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
      setErrorState('复制失败，请检查浏览器剪贴板权限')
    }
  }

  function selectSkill(skill: { id: string; displayName: string }) {
    setSelectedSkill((prev) => prev?.id === skill.id ? null : { id: skill.id, displayName: skill.displayName })
    setSkillPanelOpen(false)
  }

  const skillPanelRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const handler = (e: MouseEvent) => { if (!el.contains(e.target as Node)) setSkillPanelOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return {
    mode, setMode, input, setInput, chatMessages, setChatMessages,
    copiedMessageId, isStreaming, selectedSkill, setSelectedSkill,
    skillPanelOpen, setSkillPanelOpen, error: error, errorState: error,
    suggestions, convRef, thinkingTool,
    createChat, openChat, sendMessage, copyMessage, selectSkill, skillPanelRef,
  }
}
