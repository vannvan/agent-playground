export default function PageLoading({ label = '加载中' }: { label?: string }) {
  return (
    <div className="page-loading">
      <span className="page-loading-spinner" />
      <span className="page-loading-text">{label}</span>
    </div>
  )
}
