import { useEffect, useState } from 'react'
import { BookOpen, Database, PenLine, ShieldCheck, X } from 'lucide-react'
import { request, formatDate } from '../helpers'

type ParadigmDocument = { id: string; author: string; source: string; hash: string }
type ParadigmStatus = { updatedAt: string; extractedArticles: number; extractedDocumentIds: string[]; methodologies: string[]; globalReady: boolean; vectorChunks: number; embeddingModel: string | null }

interface Metric {
  label: string; value: string | number; meta: string
  icon: React.ElementType; tone: 'blue' | 'violet' | 'pink' | 'mint'
}

export default function ParadigmExtract() {
  const [documents, setDocuments] = useState<ParadigmDocument[]>([])
  const [status, setStatus] = useState<ParadigmStatus | null>(null)
  const [paradigmBusy, setParadigmBusy] = useState<'extract' | 'index' | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function loadParadigm() {
    try {
      const [docs, st] = await Promise.all([
        request<ParadigmDocument[]>('paradigm/documents'),
        request<ParadigmStatus>('paradigm/status'),
      ])
      setDocuments(docs); setStatus(st)
    } catch (e) { setError(e instanceof Error ? e.message : '加载失败') }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadParadigm() }, [])

  async function runParadigmAction(action: 'extract' | 'index') {
    setParadigmBusy(action)
    try {
      const result = await request<{ documents?: number; extracted?: number; skipped?: number; chunks?: number; newlyEmbedded?: number }>(`paradigm/${action}`, { method: 'POST' })
      setSuccess(action === 'extract'
        ? `范式萃取完成：扫描 ${result.documents} 篇，新增抽取 ${result.extracted} 篇，复用 ${result.skipped} 篇。`
        : `向量索引完成：${result.chunks} 个片段，新增向量 ${result.newlyEmbedded} 个。`)
      await loadParadigm()
    } catch (e) { setError(e instanceof Error ? e.message : '范式任务执行失败') }
    finally { setParadigmBusy(null) }
  }

  const metrics: Metric[] = [
    { label: '发现文档', value: documents.length, meta: '支持 Markdown / TXT', icon: BookOpen, tone: 'blue' },
    { label: '已完成单篇抽取', value: status?.extractedArticles ?? '—', meta: '断点结果保存在本地 JSON', icon: PenLine, tone: 'violet' },
    { label: '方法论状态', value: status?.globalReady ? '已就绪' : '未生成', meta: `${Math.max(0, (status?.methodologies.length ?? 0) - (status?.globalReady ? 1 : 0))} 位作者`, icon: ShieldCheck, tone: 'mint' },
    { label: '向量片段', value: status?.vectorChunks ?? '—', meta: status?.embeddingModel ?? '索引尚未构建', icon: Database, tone: 'pink' },
  ]

  return (
    <main>
      {error && <div className="admin-toast-error">{error}<button onClick={() => setError('')}><X size={14} /></button></div>}
      {success && <div className="admin-toast-success">{success}<button onClick={() => setSuccess('')}><X size={14} /></button></div>}
      <section className="admin-welcome">
        <div><span>WRITING PARADIGM / LOCAL CORPUS</span><h2>把文章沉淀成可复用的方法。</h2><p>先完成结构化范式萃取，再构建语义向量索引，写作时即可自动召回参考。</p></div>
        <span className="welcome-art"><BookOpen size={27} /></span>
      </section>
      <section className="admin-stat-grid">
        {metrics.map(m => (
          <article key={m.label} className="admin-stat-card">
            <div className={`stat-icon ${m.tone}`}><m.icon size={18} /></div>
            <span>{m.label}</span><strong>{m.value}</strong><small>{m.meta}</small>
          </article>
        ))}
      </section>
      <section className="admin-panel management-panel paradigm-panel">
        <div className="management-heading">
          <div><span>PIPELINE CONTROL</span><h2>范式处理流程</h2></div>
          <div className="paradigm-actions">
            <button className="primary-admin-button" disabled={paradigmBusy !== null || documents.length === 0} onClick={() => void runParadigmAction('extract')}>
              <PenLine size={15} />{paradigmBusy === 'extract' ? '萃取与归纳中…' : '运行范式萃取'}
            </button>
            <button className="primary-admin-button secondary-paradigm-button" disabled={paradigmBusy !== null || documents.length === 0} onClick={() => void runParadigmAction('index')}>
              <Database size={15} />{paradigmBusy === 'index' ? '向量化中…' : '构建向量索引'}
            </button>
          </div>
        </div>
        <p className="paradigm-notice">单篇抽取采用 temperature 0 和结构化输出；每篇结果会写入断点文件。重复运行会按源文件哈希跳过未变化内容。</p>
        {documents.length > 0 && (
          <div className="admin-table-scroll">
            <table className="admin-data-table">
              <thead><tr><th>作者</th><th>文档</th><th>类型</th><th>Map 状态</th></tr></thead>
              <tbody>
                {documents.map(doc => (
                  <tr key={doc.id}>
                    <td>{doc.author}</td>
                    <td>{doc.source}</td>
                    <td>{doc.source.toLowerCase().endsWith('.md') ? 'Markdown' : 'TXT'}</td>
                    <td><span className={status?.extractedDocumentIds.includes(doc.id) ? 'status-pill active' : 'status-pill inactive'}>
                      {status?.extractedDocumentIds.includes(doc.id) ? '已抽取' : '待抽取'}
                    </span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {documents.length === 0 && <div className="admin-empty"><BookOpen size={23} /><b>还没有已抽取的文档</b><span>完成范式萃取后，文档列表将显示在这里</span></div>}
        <p className="paradigm-updated">最后更新：{status ? formatDate(status.updatedAt) : '—'}</p>
      </section>
    </main>
  )
}
