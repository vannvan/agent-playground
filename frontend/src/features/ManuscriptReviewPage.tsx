import { useEffect, useRef, useState } from 'react'
import type { MutableRefObject, PointerEvent, ReactNode } from 'react'
import {
  AlertTriangle, ArrowLeft, Check, ChevronDown, Circle, Clipboard, Eye, FileText,
  LoaderCircle, Pencil, RefreshCw, WandSparkles, X,
} from 'lucide-react'
import '../App.less'
import { useNavigate } from 'react-router-dom'
import Select from '../components/Select'

type Author = { id: string; name: string; articleCount: number }
type Severity = 'severe' | 'moderate' | 'polish'
type ReviewIssue = {
  id: string
  issueKey: string
  severity: Severity
  paragraphIndex: number
  lineNumber: number
  originalText: string
  replacementText: string
  issue: string
  rationale: string
  startOffset: number
  endOffset: number
}
type ReviewResult = { issues: ReviewIssue[]; references: Array<{ author: string; source: string; score: number }>; methodologyAuthor: string | null }
type IgnoreRecord = { key: string; text: string }
const ignoredIssuesStorageKey = 'manuscript-review-ignored-issues-v1'

function loadIgnoredIssues(): IgnoreRecord[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(ignoredIssuesStorageKey) ?? '[]') as IgnoreRecord[]
    return Array.isArray(value) ? value.filter((item) => typeof item.key === 'string' && typeof item.text === 'string').slice(0, 100) : []
  } catch {
    return []
  }
}

const severityText: Record<Severity, string> = { severe: '严重', moderate: '中等', polish: '可优化' }
const severityOrder: Record<Severity, number> = { severe: 0, moderate: 1, polish: 2 }

function InlineMarkdown({ text, issues, activeIssueId, onIssueClick, registerIssue }: {
  text: string
  issues: ReviewIssue[]
  activeIssueId: string
  onIssueClick: (id: string) => void
  registerIssue: (id: string, element: HTMLElement | null) => void
}) {
  const matches = issues.flatMap((issue) => {
    const localStart = issue.startOffset
    if (localStart < 0 || text.slice(localStart, localStart + issue.originalText.length) !== issue.originalText) return []
    return [{ start: localStart, end: localStart + issue.originalText.length, issue }]
  }).sort((a, b) => a.start - b.start || b.end - a.end)
  const unique: typeof matches = []
  let lastEnd = -1
  for (const match of matches) {
    if (match.start < lastEnd) continue
    unique.push(match)
    lastEnd = match.end
  }
  const renderInline = (segment: string, keyPrefix: string): ReactNode[] => segment
    .split(/(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_)/g)
    .filter(Boolean)
    .map((token, index) => {
      const key = `${keyPrefix}-${index}`
      if (token.startsWith('**') || token.startsWith('__')) return <strong key={key}>{token.slice(2, -2)}</strong>
      if (token.startsWith('`')) return <code key={key}>{token.slice(1, -1)}</code>
      if (token.startsWith('*') || token.startsWith('_')) return <em key={key}>{token.slice(1, -1)}</em>
      return token
    })

  const nodes: ReactNode[] = []
  let cursor = 0
  for (const [index, match] of unique.entries()) {
    if (match.start > cursor) nodes.push(...renderInline(text.slice(cursor, match.start), `plain-${index}`))
    nodes.push(<mark
      className={`review-highlight ${match.issue.severity} ${activeIssueId === match.issue.id ? 'active' : ''}`}
      data-issue-id={match.issue.id}
      key={match.issue.id}
      ref={(element) => registerIssue(match.issue.id, element)}
      onClick={(event) => { event.stopPropagation(); onIssueClick(match.issue.id) }}
      title={`L${match.issue.lineNumber} · ${severityText[match.issue.severity]}`}
    >{renderInline(text.slice(match.start, match.end), `mark-${match.issue.id}`)}</mark>)
    cursor = match.end
  }
  if (cursor < text.length) nodes.push(...renderInline(text.slice(cursor), 'plain-tail'))
  return <>{nodes}</>
}

function MarkdownPreview({ value, issues, activeIssueId, onIssueClick, issueRefs }: {
  value: string
  issues: ReviewIssue[]
  activeIssueId: string
  onIssueClick: (id: string) => void
  issueRefs: MutableRefObject<Map<string, HTMLElement>>
}) {
  const lines = value.split('\n')
  const lineOffsets: number[] = []
  let runningOffset = 0
  for (const line of lines) {
    lineOffsets.push(runningOffset)
    runningOffset += line.length + 1
  }
  const blocks: ReactNode[] = []
  let paragraph: string[] = []
  let paragraphLine = 0
  const registerIssue = (id: string, element: HTMLElement | null) => {
    if (element) issueRefs.current.set(id, element)
    else issueRefs.current.delete(id)
  }
  const flushParagraph = (key: string) => {
    if (!paragraph.length) return
    const text = paragraph.join('\n')
    const paragraphOffset = lineOffsets[paragraphLine] ?? 0
    const paragraphIssues = issues.flatMap((issue) => {
      const localStart = issue.startOffset - paragraphOffset
      if (localStart < 0 || text.slice(localStart, localStart + issue.originalText.length) !== issue.originalText) return []
      return [{ ...issue, startOffset: localStart, endOffset: localStart + issue.originalText.length }]
    })
    blocks.push(<p className="review-markdown-paragraph" key={key}><InlineMarkdown text={text} issues={paragraphIssues} activeIssueId={activeIssueId} onIssueClick={onIssueClick} registerIssue={registerIssue} /></p>)
    paragraph = []
  }

  lines.forEach((line, index) => {
    const trimmed = line.trim()
    if (!trimmed) {
      flushParagraph(`p-${paragraphLine}`)
      paragraphLine = index + 1
      return
    }
    if (/^\s*([-*_]\s*){3,}$/.test(line)) {
      flushParagraph(`p-${paragraphLine}`)
      blocks.push(<hr key={`hr-${index}`} />)
      paragraphLine = index + 1
      return
    }
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/)
    if (heading) {
      flushParagraph(`p-${paragraphLine}`)
      const level = heading[1].length
      const Heading = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
      const headingText = heading[2]
      const headingOffset = lineOffsets[index] + line.indexOf(headingText)
      const headingIssues = issues.flatMap((issue) => {
        const localStart = issue.startOffset - headingOffset
        if (localStart < 0 || headingText.slice(localStart, localStart + issue.originalText.length) !== issue.originalText) return []
        return [{ ...issue, startOffset: localStart, endOffset: localStart + issue.originalText.length }]
      })
      blocks.push(<Heading key={`h-${index}`}><InlineMarkdown text={headingText} issues={headingIssues} activeIssueId={activeIssueId} onIssueClick={onIssueClick} registerIssue={registerIssue} /></Heading>)
      paragraphLine = index + 1
      return
    }
    if (!paragraph.length) paragraphLine = index
    paragraph.push(line)
  })
  flushParagraph(`p-${paragraphLine}`)
  return <div className="review-markdown-body">{blocks}</div>
}

type ManuscriptReviewPageProps = { initialDraft?: string; initialAuthor?: string; onClose?: () => void }

export default function ManuscriptReviewPage({ initialDraft = '', initialAuthor = '', onClose }: ManuscriptReviewPageProps) {
  const navigate = useNavigate()
  const [draft, setDraft] = useState(() => initialDraft.slice(0, 30_000))
  const [authors, setAuthors] = useState<Author[]>([])
  const [author, setAuthor] = useState(initialAuthor)
  const [reviewedDraft, setReviewedDraft] = useState('')
  const [issues, setIssues] = useState<ReviewIssue[]>([])
  const [ignored, setIgnored] = useState<IgnoreRecord[]>(loadIgnoredIssues)
  const [references, setReferences] = useState<ReviewResult['references']>([])
  const [reviewed, setReviewed] = useState(false)
  const [activeIssueId, setActiveIssueId] = useState('')
  const [leftWidth, setLeftWidth] = useState(390)
  const [loading, setLoading] = useState(true)
  const [reviewing, setReviewing] = useState(false)
  const [editing, setEditing] = useState(true)
  const [showDiff, setShowDiff] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(() => initialDraft ? '已载入 AI 仿写生成结果，点击「重新扫描」开始润色评审。' : '')
  const previewRef = useRef<HTMLDivElement>(null)
  const issueRefs = useRef(new Map<string, HTMLElement>())

  useEffect(() => {
    let active = true
    Promise.all([
      fetch('/api/auth/me', { credentials: 'include' }),
      fetch('/api/rewrites/authors', { credentials: 'include' }),
    ]).then(async ([authResponse, authorsResponse]) => {
      if (!authResponse.ok) throw new Error('请先登录后使用稿件润色评审')
      if (!authorsResponse.ok) throw new Error('无法读取作者列表')
      const authorResult = await authorsResponse.json() as { authors: Author[] }
      if (active) setAuthors(authorResult.authors ?? [])
    }).catch((loadError) => {
      if (active) setError(loadError instanceof Error ? loadError.message : '页面初始化失败')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  function scrollToIssue(id: string) {
    setActiveIssueId(id)
    issueRefs.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    window.setTimeout(() => setActiveIssueId((current) => current === id ? '' : current), 1500)
  }

  function resizeSplit(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = leftWidth
    const move = (moveEvent: globalThis.PointerEvent) => setLeftWidth(Math.min(window.innerWidth * 0.58, Math.max(290, startWidth + moveEvent.clientX - startX)))
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop, { once: true })
  }

  async function reviewDraft() {
    const inputDraft = draft.trim()
    if (reviewing || inputDraft.length < 80) return
    setReviewing(true)
    setError('')
    setNotice('')
    setIssues([])
    issueRefs.current.clear()
    try {
      const response = await fetch('/api/rewrites/review', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft: inputDraft, author: author || undefined, ignoredIssueKeys: ignored.map((item) => item.key) }),
      })
      const payload = await response.json() as ReviewResult & { message?: string | string[] }
      if (!response.ok) throw new Error(Array.isArray(payload.message) ? payload.message.join('，') : payload.message || '评审失败')
      setReviewedDraft(inputDraft)
      setIssues(payload.issues)
      setReferences(payload.references)
      setReviewed(true)
      setEditing(false)
      setShowDiff(false)
      if (!payload.issues.length) setNotice('本次扫描没有发现新的模板化表达问题。')
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : '评审失败，请稍后重试')
    } finally {
      setReviewing(false)
    }
  }

  function applyIssue(issue: ReviewIssue) {
    const offsetMatches = draft.slice(issue.startOffset, issue.endOffset) === issue.originalText
    const index = offsetMatches ? issue.startOffset : draft.indexOf(issue.originalText)
    if (index < 0) {
      setError('原文片段已变化，请重新扫描后再应用建议。')
      return
    }
    const endOffset = index + issue.originalText.length
    const delta = issue.replacementText.length - issue.originalText.length
    setDraft(`${draft.slice(0, index)}${issue.replacementText}${draft.slice(endOffset)}`)
    setIssues((current) => current.filter((item) => item.id !== issue.id).map((item) => item.startOffset >= endOffset
      ? { ...item, startOffset: item.startOffset + delta, endOffset: item.endOffset + delta }
      : item))
    issueRefs.current.delete(issue.id)
    setActiveIssueId('')
    setNotice('修改已应用。可重新扫描当前稿件检查剩余内容。')
  }

  function ignoreIssue(issue: ReviewIssue) {
    const nextIgnored = ignored.some((item) => item.key === issue.issueKey) ? ignored : [...ignored, { key: issue.issueKey, text: issue.originalText }].slice(-100)
    setIgnored(nextIgnored)
    try { window.localStorage.setItem(ignoredIssuesStorageKey, JSON.stringify(nextIgnored)) } catch { /* Ignoring still applies for this page session. */ }
    setIssues((current) => current.filter((item) => item.id !== issue.id))
    issueRefs.current.delete(issue.id)
    setActiveIssueId('')
  }

  async function copyCurrentDraft() {
    try {
      await navigator.clipboard.writeText(draft)
      setNotice('全文已复制')
      window.setTimeout(() => setNotice(''), 1800)
    } catch {
      setError('复制失败，请检查浏览器剪贴板权限')
    }
  }

  function updateDraft(nextDraft: string) {
    setDraft(nextDraft)
    setIssues([])
    setReviewed(false)
    issueRefs.current.clear()
    setActiveIssueId('')
  }

  const counts = issues.reduce((summary, issue) => ({ ...summary, [issue.severity]: summary[issue.severity] + 1 }), { severe: 0, moderate: 0, polish: 0 })
  const currentChars = Array.from(draft).length
  const originalLines = reviewedDraft.split('\n')
  const currentLines = draft.split('\n')

  return <main className="review-page review-tool-page">
    <header className="review-topbar">
      {onClose ? <button type="button" className="review-back review-close-button" onClick={onClose}><ArrowLeft size={16} />返回 AI 仿写</button> : <button className="review-back" type="button" onClick={() => navigate("/")}><ArrowLeft size={16} /> 返回创作空间</button>}
      <div className="review-brand"><span><WandSparkles size={17} /></span><b>稿件润色评审</b></div>
    </header>
    {error && <p className="review-feedback error review-global-feedback" role="alert">{error}<button type="button" onClick={() => setError('')} aria-label="关闭错误"><X size={14} /></button></p>}
    {notice && <p className="review-feedback success review-global-feedback" role="status">{notice}<button type="button" onClick={() => setNotice('')} aria-label="关闭提示"><X size={14} /></button></p>}
    <div className="review-split-layout" style={{ gridTemplateColumns: `${leftWidth}px 8px minmax(0, 1fr)` }}>
      <aside className="review-issue-sidebar">
        <div className="review-sidebar-heading"><div><span className="eyebrow">EDITOR / SCAN</span><h1>问题检查</h1></div><button type="button" className="review-rescan" onClick={() => void reviewDraft()} disabled={loading || reviewing || draft.trim().length < 80} title="重新扫描全文">{reviewing ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}重新扫描</button></div>
        <label className="review-author-filter" htmlFor="review-author">参考风格
          <Select id="review-author" size="compact" value={author} onValueChange={setAuthor} disabled={loading || authors.length === 0} options={[
            { value: '', label: '通用方法论' },
            ...authors.map((item) => ({ value: item.id, label: item.name })),
          ]} />
        </label>
        <section className="review-severity-summary" aria-label="严重程度分布">
          <h2>严重程度分布</h2>
          <div><span className="severity-indicator severe"><AlertTriangle size={14} />严重</span><b>{counts.severe}</b></div>
          <div><span className="severity-indicator moderate"><Circle size={12} fill="currentColor" />中等</span><b>{counts.moderate}</b></div>
          <div><span className="severity-indicator polish"><Circle size={12} fill="currentColor" />可优化</span><b>{counts.polish}</b></div>
        </section>
        <div className="review-issues-heading"><h2>问题列表</h2><span>{issues.length} 项待处理</span></div>
        <div className="review-issues-list">
          {issues.length ? [...issues].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || a.lineNumber - b.lineNumber).map((issue) => <article className={`review-issue-card ${activeIssueId === issue.id ? 'active' : ''}`} key={issue.id} onClick={() => scrollToIssue(issue.id)}>
            <div className="review-issue-tags"><span className={`severity-tag ${issue.severity}`}>{severityText[issue.severity]}</span><span className="line-tag">L{issue.lineNumber}</span></div>
            <h3>{issue.issue}</h3><p className="review-issue-rationale">{issue.rationale}</p>
            <div className="review-diff-snippet"><div className="old-snippet"><b>−</b><span>{issue.originalText}</span></div><div className="new-snippet"><b>+</b><span>{issue.replacementText}</span></div></div>
            <div className="review-issue-actions"><button type="button" className="apply-issue" onClick={(event) => { event.stopPropagation(); applyIssue(issue) }}><Check size={13} />应用</button><button type="button" className="ignore-issue" onClick={(event) => { event.stopPropagation(); ignoreIssue(issue) }}><ChevronDown size={13} />忽略</button></div>
          </article>) : <div className="review-issues-empty"><Check size={20} /><b>{reviewed ? '没有待处理问题' : '等待扫描稿件'}</b><span>{reviewed ? '所有问题已处理，或没有发现明显 AI 模板痕迹。' : '在右侧编辑区粘贴稿件，然后点击重新扫描。'}</span></div>}
        </div>
        {references.length > 0 && <div className="review-reference-list"><b>相似范文参考</b>{references.map((reference) => <span key={`${reference.author}/${reference.source}`}>{reference.author} · {reference.source}</span>)}</div>}
      </aside>

      <div className="review-splitter" role="separator" aria-orientation="vertical" aria-label="拖动调整左右栏宽度" onPointerDown={resizeSplit}><span /></div>

      <section className="review-document-panel">
        <header className="review-document-toolbar">
          <div className="review-document-title"><FileText size={16} /><strong>原文预览</strong><span>{currentChars.toLocaleString()} 字符</span></div>
          <div className="review-document-actions">
            <button type="button" onClick={() => setShowDiff((current) => !current)} disabled={!reviewed} className={showDiff ? 'selected' : ''}><Eye size={14} />{showDiff ? '查看原文' : '查看变更'}</button>
            <button type="button" onClick={() => setEditing((current) => !current)}><Pencil size={14} />{editing ? 'Markdown 预览' : '编辑原文'}</button>
            <button type="button" onClick={() => void copyCurrentDraft()} disabled={!draft}><Clipboard size={14} />复制全文</button>
          </div>
        </header>
        {loading ? <div className="review-document-empty"><LoaderCircle className="spin" size={20} />正在加载范式配置…</div> : showDiff ? <div className="review-diff-view"><section><h2>扫描时初稿</h2><pre>{originalLines.map((line, index) => <span key={index}>{line || ' '}<br /></span>)}</pre></section><section><h2>当前稿件（已应用修改）</h2><pre>{currentLines.map((line, index) => <span key={index}>{line || ' '}<br /></span>)}</pre></section></div> : editing ? <textarea className="review-source-editor" value={draft} onChange={(event) => updateDraft(event.target.value.slice(0, 30_000))} maxLength={30_000} placeholder="在此粘贴或编辑 Markdown 稿件…" spellCheck={false} /> : draft ? <div className="review-document-scroll" ref={previewRef}><MarkdownPreview value={draft} issues={issues} activeIssueId={activeIssueId} onIssueClick={scrollToIssue} issueRefs={issueRefs} /></div> : <div className="review-document-empty"><FileText size={25} /><b>原文预览区</b><span>点击「编辑原文」粘贴 Markdown 稿件，然后点击重新扫描。</span></div>}
        <footer className="review-document-footer"><span><span className="highlight-key severe" />严重</span><span><span className="highlight-key moderate" />中等</span><span><span className="highlight-key polish" />可优化</span><span className="review-footer-spacer" />{reviewing && <span className="review-stream-status"><LoaderCircle className="spin" size={13} />正在扫描…</span>}</footer>
      </section>
    </div>
  </main>
}
