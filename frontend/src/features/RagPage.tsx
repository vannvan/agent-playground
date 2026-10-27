import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, BookOpen, Check, CircleAlert, FileText, FileUp, FolderOpen, LoaderCircle, MessageSquareText, Plus, RefreshCw, Send, Trash2 } from 'lucide-react'
import 'streamdown/styles.css'
import Select from '../components/Select'
import './RagPage.less'

const Streamdown = lazy(() => import('streamdown').then(({ Streamdown: Component }) => ({ default: Component })))

type RagDocument = { id: string; name: string; type: 'pdf' | 'md' | 'txt'; size: number; chunkSize: number; chunkCount: number; createdAt: string }
type RagCitation = { documentId: string; documentName: string; section: string; page?: number; chunkId: string }
type RagAnswer = { answer: string; sources: RagCitation[]; rewrittenQueries: string[]; reranked: boolean }

const chunkOptions = [500, 800, 1000, 1200, 1600, 2000].map((value) => ({ label: `${value} 字符`, value: String(value) }))
const topKOptions = [3, 5, 8, 10, 15, 20].map((value) => ({ label: `${value} 条`, value: String(value) }))

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function RagPage() {
  const navigate = useNavigate()
  const [documents, setDocuments] = useState<RagDocument[]>([])
  const [chunkSize, setChunkSize] = useState('1000')
  const [topK, setTopK] = useState('5')
  const [rerank, setRerank] = useState(true)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<RagAnswer | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [asking, setAsking] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)

  const loadDocuments = useCallback(async () => {
    const response = await fetch('/api/rag/documents', { credentials: 'include' })
    if (response.status === 401) throw new Error('请先登录后使用知识库问答')
    if (!response.ok) throw new Error('读取知识库文档失败')
    setDocuments(await response.json() as RagDocument[])
  }, [])

  useEffect(() => {
    folderInput.current?.setAttribute('webkitdirectory', '')
    let active = true
    fetch('/api/rag/documents', { credentials: 'include' }).then(async (response) => {
      if (response.status === 401) throw new Error('请先登录后使用知识库问答')
      if (!response.ok) throw new Error('读取知识库文档失败')
      const result = await response.json() as RagDocument[]
      if (active) setDocuments(result)
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : '页面初始化失败')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  async function uploadFiles(fileList: FileList | null, input: HTMLInputElement | null) {
    if (!fileList?.length) return
    const files = Array.from(fileList)
    setError('')
    setNotice('')
    setUploading(true)
    try {
      if (files.length > 100) throw new Error('一次最多选择 100 个文件')
      if (files.reduce((total, file) => total + file.size, 0) > 60 * 1024 * 1024) throw new Error('本次批量上传总大小不能超过 60 MB')
      const body = new FormData()
      files.forEach((file) => body.append('files', file, file.webkitRelativePath || file.name))
      const response = await fetch(`/api/rag/documents?chunkSize=${encodeURIComponent(chunkSize)}`, { method: 'POST', body, credentials: 'include' })
      const payload = await response.json() as {
        message?: string
        successCount?: number
        failedCount?: number
        results?: Array<{ name: string; success: boolean; error?: string }>
      }
      if (!response.ok) throw new Error(payload.message || '文档入库失败')
      const failed = payload.results?.filter((result) => !result.success) ?? []
      const successCount = payload.successCount ?? files.length
      if (successCount === 0) setError(failed.map((result) => `${result.name}：${result.error || '入库失败'}`).join('；') || '所选文档均未能入库')
      else setNotice(`批量入库完成：成功 ${successCount} 个${payload.failedCount ? `，失败 ${payload.failedCount} 个（${failed.map((result) => `${result.name}：${result.error || '入库失败'}`).join('；')}）` : ''}`)
      await loadDocuments()
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '文档入库失败')
    } finally {
      setUploading(false)
      if (input) input.value = ''
    }
  }

  async function deleteDocument(document: RagDocument) {
    if (!window.confirm(`确定删除「${document.name}」及其所有索引片段吗？`)) return
    setDeletingId(document.id)
    setError('')
    try {
      const response = await fetch(`/api/rag/documents/${encodeURIComponent(document.id)}`, { method: 'DELETE', credentials: 'include' })
      const payload = await response.json() as { message?: string }
      if (!response.ok) throw new Error(payload.message || '删除文档失败')
      setDocuments((current) => current.filter((item) => item.id !== document.id))
      if (answer?.sources.some((source) => source.documentId === document.id)) setAnswer(null)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '删除文档失败')
    } finally {
      setDeletingId('')
    }
  }

  async function askQuestion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const prompt = question.trim()
    if (!prompt || asking) return
    setAsking(true)
    setError('')
    setNotice('')
    setAnswer(null)
    try {
      const response = await fetch('/api/rag/ask', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: prompt, topK: Number(topK), rerank }),
      })
      const payload = await response.json() as RagAnswer & { message?: string }
      if (!response.ok) throw new Error(payload.message || '知识库问答失败')
      setAnswer(payload)
    } catch (askError) {
      setError(askError instanceof Error ? askError.message : '知识库问答失败')
    } finally {
      setAsking(false)
    }
  }

  return <main className="rag-page">
    <header className="rag-topbar">
      <button className="rag-back" type="button" onClick={() => navigate("/")}><ArrowLeft size={16} /> 返回创作空间</button>
      <span className="rag-private"><span /> 私有知识库 · 仅本人可见</span>
    </header>
    <div className="rag-layout">
      <section className="rag-main-column">
        <div className="rag-heading">
          <div className="rag-heading-icon"><BookOpen size={22} /></div>
          <div><p className="rag-eyebrow">PERSONAL KNOWLEDGE BASE</p><h1>知识库问答</h1><p>把自己的资料变成可检索、可溯源的答案。</p></div>
        </div>

        <section className="rag-card rag-question-card">
          <div className="rag-card-heading"><div><span className="rag-step">01</span><h2>向资料提问</h2></div><span className="rag-muted">回答仅依据已入库内容</span></div>
          <form onSubmit={askQuestion}>
            <label className="rag-sr-only" htmlFor="rag-question">输入问题</label>
            <textarea id="rag-question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={4000} placeholder="例如：这份资料中提到的项目目标和关键时间节点是什么？" rows={4} />
            <div className="rag-question-controls">
              <div className="rag-select-control"><span>召回来源</span><Select aria-label="召回来源数量" options={topKOptions} value={topK} onValueChange={setTopK} size="compact" /></div>
              <label className="rag-toggle"><input type="checkbox" checked={rerank} onChange={(event) => setRerank(event.target.checked)} /><span className="rag-toggle-track" /><span>启用精排</span></label>
              <button className="rag-primary-button" type="submit" disabled={!question.trim() || asking || documents.length === 0}>
                {asking ? <LoaderCircle className="spin" size={16} /> : <Send size={15} />}{asking ? '正在检索并校验…' : '开始回答'}
              </button>
            </div>
          </form>
          {documents.length === 0 && !loading && <p className="rag-inline-hint">请先上传至少一份资料，再开始提问。</p>}
        </section>

        {(error || notice) && <div className={error ? 'rag-alert is-error' : 'rag-alert is-success'} role="status">
          {error ? <CircleAlert size={17} /> : <Check size={17} />}<span>{error || notice}</span>
          {error && <button type="button" onClick={() => setError('')} aria-label="关闭提示">×</button>}
        </div>}

        <section className="rag-card rag-answer-card">
          <div className="rag-card-heading"><div><span className="rag-step">02</span><h2>回答与来源</h2></div>{answer && <span className="rag-answer-badge"><Check size={13} /> 已完成依据校验</span>}</div>
          {asking ? <div className="rag-answer-loading"><LoaderCircle className="spin" size={22} /><span>正在改写查询、检索资料并检查回答依据</span></div>
            : answer ? <>
              <div className="rag-answer-text"><Suspense fallback={<p>{answer.answer}</p>}><Streamdown mode="static">{answer.answer}</Streamdown></Suspense></div>
              <div className="rag-source-heading"><span>参考来源</span><span>{answer.sources.length} 个片段{answer.reranked ? ' · 已精排' : ''}</span></div>
              {answer.sources.length ? <ol className="rag-source-list">{answer.sources.map((source, index) => <li key={`${source.chunkId}-${index}`}><span className="rag-source-number">{index + 1}</span><div><strong>{source.documentName}</strong><span>{source.section}{source.page ? ` · 第 ${source.page} 页` : ''}</span></div><FileText size={16} /></li>)}</ol>
                : <p className="rag-no-sources">本次回答未引用具体片段，知识库可能缺少相关信息。</p>}
            </> : <div className="rag-answer-empty"><span><MessageSquareText size={23} /></span><strong>答案会显示在这里</strong><p>每个回答都会附上对应文档和章节，方便回到原文核对。</p></div>}
        </section>
      </section>

      <aside className="rag-side-column">
        <section className="rag-card rag-library-card">
          <div className="rag-card-heading"><div><span className="rag-step">LIBRARY</span><h2>我的资料</h2></div><button className="rag-icon-button" type="button" onClick={() => void loadDocuments().catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : '刷新失败'))} aria-label="刷新文档列表"><RefreshCw size={16} /></button></div>
          <p className="rag-library-intro">资料独立存放于你的知识库，不会进入其他创作功能。</p>
          <input ref={fileInput} className="rag-sr-only" type="file" multiple accept=".pdf,.md,.markdown,.txt,application/pdf,text/markdown,text/plain" onChange={(event) => void uploadFiles(event.currentTarget.files, event.currentTarget)} />
          <input ref={folderInput} className="rag-sr-only" type="file" multiple accept=".pdf,.md,.markdown,.txt,application/pdf,text/markdown,text/plain" onChange={(event) => void uploadFiles(event.currentTarget.files, event.currentTarget)} />
          <div className="rag-upload-actions">
            <button className="rag-upload-button" type="button" disabled={uploading} onClick={() => fileInput.current?.click()}>
              {uploading ? <LoaderCircle className="spin" size={18} /> : <FileUp size={18} />}
              <span><strong>{uploading ? '正在解析并入库…' : '选择多个文件'}</strong><small>PDF、Markdown、TXT · 最多 100 个，单个最大 15 MB</small></span><Plus size={17} />
            </button>
            <button className="rag-folder-button" type="button" disabled={uploading} onClick={() => folderInput.current?.click()}><FolderOpen size={15} /> 选择文件夹</button>
          </div>
          <label className="rag-setting-label" htmlFor="rag-chunk-size">分块长度</label>
          <Select id="rag-chunk-size" options={chunkOptions} value={chunkSize} onValueChange={setChunkSize} size="compact" />
          <div className="rag-documents-heading"><span>已入库文档</span><b>{documents.length}</b></div>
          {loading ? <div className="rag-doc-empty"><LoaderCircle className="spin" size={17} /> 正在读取资料…</div>
            : documents.length ? <ul className="rag-document-list">{documents.map((document) => <li key={document.id}>
              <span className={`rag-file-type type-${document.type}`}>{document.type.toUpperCase()}</span>
              <span className="rag-document-info"><strong title={document.name}>{document.name}</strong><small>{document.chunkCount} 个片段 · {formatBytes(document.size)}</small></span>
              <button className="rag-delete-button" type="button" disabled={deletingId === document.id} onClick={() => void deleteDocument(document)} aria-label={`删除 ${document.name}`} title="删除文档">{deletingId === document.id ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />}</button>
            </li>)}</ul>
              : <div className="rag-doc-empty"><FileText size={19} /><span>还没有资料<br /><small>添加文件开始构建你的知识库</small></span></div>}
        </section>
        <div className="rag-privacy-note"><span className="rag-privacy-icon">✦</span><div><strong>独立且私有</strong><p>每位用户拥有单独的索引与文档。删除资料后，对应向量片段也会一并移除。</p></div></div>
      </aside>
    </div>
  </main>
}
