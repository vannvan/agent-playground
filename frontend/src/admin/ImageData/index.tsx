import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Image as ImageIcon, RefreshCw, Search, X } from 'lucide-react'
import { request, formatDate } from '../helpers'

type AdminGeneration = { id: string; owner: string; title: string; summary: string; content?: string; resultUrl?: string | null; model: string; createdAt: string }

export default function ImageData() {
  const [generations, setGenerations] = useState<AdminGeneration[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [selectedGeneration, setSelectedGeneration] = useState<AdminGeneration | null>(null)

  const loadImages = useCallback(async () => {
    setRefreshing(true)
    try {
      const result = await request<{ items: AdminGeneration[]; total: number }>(`generations/image?search=${encodeURIComponent(search)}&page=${page}&pageSize=12`)
      setGenerations(result.items); setTotal(result.total)
      setError('')
    } catch (e) { setError(e instanceof Error ? e.message : '加载失败') }
    finally { setRefreshing(false) }
  }, [search, page])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadImages() }, [loadImages])

  async function openGeneration(record: AdminGeneration) {
    try {
      const payload = await request<Pick<AdminGeneration, 'content' | 'resultUrl'>>(`generations/image/${encodeURIComponent(record.id)}`)
      setSelectedGeneration({ ...record, ...payload })
    } catch (e) { setError(e instanceof Error ? e.message : '无法读取创作记录') }
  }

  return (
    <main className="image-data">
      {error && <div className="admin-toast-error">{error}<button onClick={() => setError('')}><X size={14} /></button></div>}
      {success && <div className="admin-toast-success">{success}<button onClick={() => setSuccess('')}><X size={14} /></button></div>}
      <section className="admin-panel management-panel">
        <div className="management-heading">
          <div><span>IMAGE GENERATION ARCHIVE</span><h2>AI 生图记录 <small>{total}</small></h2></div>
          <div className="management-actions">
            <label className="admin-search"><Search size={15} /><input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="搜索描述、模型或用户邮箱" /></label>
            <button className="admin-refresh" onClick={() => void loadImages()} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'is-refreshing' : ''} />刷新</button>
          </div>
        </div>
        <div className="admin-table-scroll">
          <table className="admin-data-table">
            <thead><tr><th>图片描述</th><th>归属用户</th><th>尺寸 / 模型</th><th>生成时间</th><th>操作</th></tr></thead>
            <tbody>
              {generations.map(record => (
                <tr key={record.id} onClick={() => void openGeneration(record)}>
                  <td><div className="session-name"><span className="session-type-icon"><ImageIcon size={15} /></span><span><b>{record.title || '未命名'}</b><small>{record.summary}</small></span></div></td>
                  <td>{record.owner}</td>
                  <td>{record.summary}</td>
                  <td>{formatDate(record.createdAt)}</td>
                  <td><button className="icon-button" onClick={(e) => { e.stopPropagation(); void openGeneration(record) }}>查看</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {generations.length === 0 && <div className="admin-empty"><ImageIcon size={23} /><b>暂无生图记录</b><span>用户生成的图片会显示在这里</span></div>}
        </div>
        <div className="table-pagination">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={14} />上一页</button>
          <span>第 {page} 页 / 共 {Math.ceil(total / 12)} 页</span>
          <button disabled={page * 12 >= total} onClick={() => setPage(p => p + 1)}>下一页<ChevronRight size={14} /></button>
        </div>
      </section>
      {selectedGeneration && (
        <div className="admin-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setSelectedGeneration(null) }}>
          <section className="chat-detail-modal">
            <header><div><span>IMAGE GENERATION</span><h2>{selectedGeneration.title || '生成详情'}</h2></div><button onClick={() => setSelectedGeneration(null)}><X size={18} /></button></header>
            {selectedGeneration.resultUrl && <div className="generation-result"><img src={selectedGeneration.resultUrl} alt={selectedGeneration.summary} /></div>}
            <div className="generation-content"><p>{selectedGeneration.content}</p></div>
          </section>
        </div>
      )}
    </main>
  )
}
