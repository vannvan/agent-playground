import { lazy, Suspense, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy, FileText, LoaderCircle, PenLine, Sparkles } from 'lucide-react'
import ManuscriptReviewPage from './ManuscriptReviewPage'
import Select from '../components/Select'

const Streamdown = lazy(() => import('streamdown').then(({ Streamdown: Component }) => ({ default: Component })))

type Author = { id: string; name: string; articleCount: number }
type RewriteHistoryItem = { id: string; author: string; topic: string; createdAt: string }
type RewriteDraft = RewriteHistoryItem & { constraints: string; article: string; model: string }

type RewriteWorkspaceProps = {
  history: RewriteHistoryItem[]
  activeId: string
  onSelect: (id: string) => Promise<RewriteDraft>
  onNew: () => void
  onCreated: (rewrite: RewriteHistoryItem) => void
}

export function RewriteWorkspace({ history, activeId, onSelect, onNew, onCreated }: RewriteWorkspaceProps) {
  const [authors, setAuthors] = useState<Author[]>([])
  const [knowledgeBaseAvailable, setKnowledgeBaseAvailable] = useState(true)
  const [author, setAuthor] = useState('')
  const [topic, setTopic] = useState('')
  const [constraints, setConstraints] = useState('')
  const [targetLength, setTargetLength] = useState(1500)
  const [article, setArticle] = useState('')
  const [error, setError] = useState('')
  const [loadingAuthors, setLoadingAuthors] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isManuscriptReviewOpen, setIsManuscriptReviewOpen] = useState(false)

  useEffect(() => {
    if (!isManuscriptReviewOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [isManuscriptReviewOpen])

  useEffect(() => {
    let active = true
    if (!activeId) {
      return () => { active = false }
    }
    onSelect(activeId)
      .then((rewrite) => {
        if (!active) return
        setArticle(rewrite.article)
        setAuthor(rewrite.author)
        setTopic(rewrite.topic)
        setConstraints(rewrite.constraints)
        setCopied(false)
        setError('')
      })
      .catch((requestError) => { if (active) setError(requestError instanceof Error ? requestError.message : '无法打开这篇仿写文章') })
    return () => { active = false }
  }, [activeId, onSelect])

  useEffect(() => {
    let active = true
    fetch('/api/rewrites/authors', { credentials: 'include' })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.message || '作者列表加载失败')
        if (!active) return
        setAuthors(result.authors as Author[])
        setKnowledgeBaseAvailable(result.knowledgeBaseAvailable)
        setAuthor((current) => current || result.authors[0]?.id || '')
      })
      .catch((requestError) => { if (active) setError(requestError instanceof Error ? requestError.message : '作者列表加载失败') })
      .finally(() => { if (active) setLoadingAuthors(false) })
    return () => { active = false }
  }, [])

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!author || !topic.trim() || generating) return
    setGenerating(true)
    setError('')
    setArticle('')
    setCopied(false)
    try {
      const response = await fetch('/api/rewrites/generate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author, topic: topic.trim(), constraints: constraints.trim(), targetLength }),
      })
      if (!response.ok || !response.body) {
        const result = await response.json().catch(() => ({}))
        throw new Error(Array.isArray(result.message) ? result.message.join('，') : result.message || '文章生成失败')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let completed: { id: string; author: string; topic: string } | null = null
      const consumeEvent = (rawEvent: string) => {
        const eventName = rawEvent.match(/^event:\s*(.+)$/m)?.[1]?.trim()
        const data = rawEvent.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n')
        if (!data) return
        const payload = JSON.parse(data) as { content?: string; message?: string; id?: string; author?: string; topic?: string }
        if (eventName === 'error') throw new Error(payload.message || '文章生成失败')
        if (eventName === 'done') {
          if (!payload.id || !payload.author || !payload.topic) throw new Error('生成完成事件缺少文章信息')
          completed = { id: payload.id, author: payload.author, topic: payload.topic }
          return
        }
        if (payload.content) setArticle((current) => current + payload.content)
      }

      while (true) {
        const { value, done } = await reader.read()
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })
        const events = buffer.split(/\r?\n\r?\n/)
        buffer = events.pop() ?? ''
        for (const rawEvent of events) consumeEvent(rawEvent)
        if (done) break
      }
      if (buffer.trim()) consumeEvent(buffer)
      if (!completed) throw new Error('连接已结束，但服务端未返回完成事件')
      const generatedRewrite = completed as { id: string; author: string; topic: string }
      onCreated({ ...generatedRewrite, createdAt: new Date().toISOString() })
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '文章生成失败，请稍后重试')
    } finally {
      setGenerating(false)
    }
  }

  async function copyArticle() {
    try {
      await navigator.clipboard.writeText(article)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setError('复制失败，请检查浏览器剪贴板权限')
    }
  }

  function openManuscriptReview() {
    setError('')
    setIsManuscriptReviewOpen(true)
  }

  const visibleArticle = activeId || generating ? article : ''

  return <div className="rewrite-workspace">
    {/* <header className="rewrite-intro">
      <span className="rewrite-icon"><PenLine size={20} /></span>
      <div>
        <span className="eyebrow">VOICE / REWRITE</span>
        <h3>AI 仿写 <em>灵感成文。</em></h3>
        <p>选择作者风格，给出主题与限定条件，生成一篇全新文章。</p>
      </div>
      <span className="rewrite-intro-mark"><Sparkles size={20} /></span>
    </header> */}

    <div className="rewrite-layout">
      <form className="rewrite-form" onSubmit={generate}>
        <label htmlFor="rewrite-author">选择作者</label>
        <Select id="rewrite-author" value={author} onValueChange={setAuthor} disabled={loadingAuthors || authors.length === 0} options={[
          ...(loadingAuthors ? [{ value: '', label: '正在读取作者…' }] : []),
          ...(!loadingAuthors && authors.length === 0 ? [{ value: '', label: '暂无可用作者' }] : []),
          ...authors.map((item) => ({ value: item.id, label: `${item.name} · ${item.articleCount} 篇文章` })),
        ]} />
        {!knowledgeBaseAvailable && <p className="rewrite-hint">未找到 knowledgeBase 目录。请在项目根目录添加作者文件夹及 Markdown 文章。</p>}
        {knowledgeBaseAvailable && authors.length === 0 && !loadingAuthors && <p className="rewrite-hint">目录已就绪，请在 knowledgeBase 下为每位作者创建文件夹，并放入 .md 文章。</p>}

        <label htmlFor="rewrite-topic">话题 / 主题</label>
        <textarea id="rewrite-topic" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="例如：普通人如何建立长期有效的阅读习惯" rows={3} maxLength={500} required />

        <label htmlFor="rewrite-constraints">限定词与补充要求 <span>可选</span></label>
        <textarea id="rewrite-constraints" value={constraints} onChange={(event) => setConstraints(event.target.value)} placeholder="例如：面向职场新人，语气轻松，结合具体场景，避免说教" rows={3} maxLength={1500} />

        <div className="rewrite-form-bottom">
          <label htmlFor="rewrite-length">目标篇幅
            <Select id="rewrite-length" size="compact" wrapperClassName="rewrite-length-select" value={String(targetLength)} onValueChange={(value) => setTargetLength(Number(value))} options={[
              { value: '800', label: '短篇 · 约 800 字' },
              { value: '1500', label: '标准 · 约 1500 字' },
              { value: '2500', label: '长篇 · 约 2500 字' },
              { value: '4000', label: '详细 · 约 4000 字' },
            ]} />
          </label>
          <button className="generate-button" type="submit" disabled={!author || !topic.trim() || generating || loadingAuthors}>
            {generating ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
            {generating ? '撰写中…' : '开始仿写'}
          </button>
        </div>
        <p className="rewrite-footnote"><FileText size={13} />生成只使用抽象文风标签，不向写作模型提供范文原文或来源观点。</p>
      </form>

      <section className={visibleArticle ? 'rewrite-result has-article' : 'rewrite-result'} aria-live="polite">
        {visibleArticle ? <>
          <div className="rewrite-result-heading"><div><span className="eyebrow">YOUR NEW DRAFT · {history.length} 篇已保存</span><h4>{generating ? '正在生成…' : '生成结果'}</h4></div><div className="rewrite-result-actions"><button type="button" className="rewrite-polish-action" onClick={openManuscriptReview} disabled={generating || !article.trim()}><PenLine size={14} />稿件润色</button><button type="button" onClick={() => { setArticle(''); setError(''); onNew() }} disabled={generating}>新建</button><button type="button" onClick={() => void copyArticle()} aria-label="复制文章" disabled={generating}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? '已复制' : '复制全文'}</button></div></div>
          <article className="rewrite-article rewrite-markdown">
            <Suspense fallback={<p>{visibleArticle}</p>}>
              <Streamdown className="assistant-markdown" mode="streaming" isAnimating={generating}>{visibleArticle}</Streamdown>
            </Suspense>
          </article>
        </> : <div className="rewrite-empty">
          {generating ? <LoaderCircle className="spin" size={28} /> : <span className="rewrite-empty-icon"><FileText size={23} /></span>}
          <b>{generating ? '正在整理作者风格并撰写…' : '文章将在这里呈现'}</b>
          <p>{generating ? '已限制参考内容规模，生成通常需要一些时间。' : '选择作者并填写主题，开始创作你的新文章。'}</p>
        </div>}
      </section>
    </div>
    {error && <p className="rewrite-error" role="alert">{error}</p>}
    {isManuscriptReviewOpen && createPortal(
      <div className="manuscript-review-modal-backdrop" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setIsManuscriptReviewOpen(false)
      }}>
        <ManuscriptReviewPage initialDraft={article} initialAuthor={author} onClose={() => setIsManuscriptReviewOpen(false)} />
      </div>,
      document.body,
    )}
  </div>
}