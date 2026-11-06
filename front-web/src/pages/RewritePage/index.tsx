import { RewriteWorkspace } from '../../features/RewriteWorkspace'
import type { RewriteHistoryItem } from '../../types'

interface RewritePageProps {
  rewrites: RewriteHistoryItem[]
  activeRewriteId: string
  setRewrites: React.Dispatch<React.SetStateAction<RewriteHistoryItem[]>>
  setActiveRewriteId: React.Dispatch<React.SetStateAction<string>>
  onOpenSettings: () => void
  onSetSettingsTab: (tab: 'model' | 'profile') => void
}

export function RewritePage({
  rewrites,
  activeRewriteId,
  setRewrites,
  setActiveRewriteId,
}: RewritePageProps) {
  const openRewrite = async (rewriteId: string) => {
    const { rewritesApi } = await import('../../services/api')
    return rewritesApi.open(rewriteId)
  }

  return (
    <RewriteWorkspace
      history={rewrites}
      activeId={activeRewriteId}
      onSelect={openRewrite}
      onNew={() => setActiveRewriteId('')}
      onCreated={(rewrite) => {
        setRewrites((current) => [rewrite, ...current.filter((item) => item.id !== rewrite.id)].slice(0, 30))
        setActiveRewriteId(rewrite.id)
      }}
    />
  )
}
