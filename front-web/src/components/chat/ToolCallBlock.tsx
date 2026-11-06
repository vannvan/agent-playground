import { useState } from 'react'
import { ChevronRight, Search, LoaderCircle } from 'lucide-react'
import type { ChatBlock } from '../../types'

const TOOL_LABELS: Record<string, string> = {
  search_knowledge_base: '🔍 检索知识库',
  ask_clarification:     '❓ 澄清问题',
  search_recursive:      '🔄 多步检索',
  route_to_other:        '🔀 转接能力',
  explain_or_run_code:   '💻 代码解释',
  remember_user_pref:    '📝 记录偏好',
}

export function ToolCallBlock({ block }: { block: Extract<ChatBlock, { type: 'tool' }>; isLast?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const label = TOOL_LABELS[block.tool] ?? block.tool
  const hasSources = (block.sources?.length ?? 0) > 0

  return (
    <div className="tool-call-block">
      <button
        type="button"
        className={`tool-call-header${block.loading ? ' loading' : ''}`}
        onClick={() => hasSources && setExpanded((v) => !v)}
        disabled={block.loading}
      >
        {block.loading ? (
          <LoaderCircle size={13} className="spin" />
        ) : hasSources ? (
          <ChevronRight size={13} className={`chevron${expanded ? ' open' : ''}`} />
        ) : (
          <Search size={13} />
        )}
        <span className="tool-label">{label}</span>
        {!block.loading && block.args && (
          <span className="tool-args">{block.args.slice(0, 80)}{block.args.length > 80 ? '…' : ''}</span>
        )}
      </button>
      {expanded && hasSources && (
        <div className="tool-sources">
          {block.sources!.map((s, i) => (
            <div key={i} className="tool-source-item">
              <span className="tool-source-file">{s.file}</span>
              <p className="tool-source-content">{s.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
