import { AlertCircle } from 'lucide-react'
import type { ChatBlock } from '../../../types'

export function ClarifyBlock({ block, onContinue }: {
  block: Extract<ChatBlock, { type: 'clarify' }>
  onContinue: () => void
}) {
  return (
    <div className="clarify-block">
      <div className="clarify-icon"><AlertCircle size={15} /></div>
      <div className="clarify-body">
        <p className="clarify-question">{block.question}</p>
        <p className="clarify-hint">请补充信息后继续对话</p>
      </div>
      <button type="button" className="clarify-continue" onClick={onContinue}>
        我已知晓，继续
      </button>
    </div>
  )
}
