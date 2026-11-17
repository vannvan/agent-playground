import { Suspense, useEffect, useRef, lazy } from 'react'
import { LoaderCircle } from 'lucide-react'
import type { ChatBlock } from '../../types'
import { sourceFileUrl } from '../../services/api'
import { ToolCallBlock } from './ToolCallBlock'
import { ClarifyBlock } from './ClarifyBlock'
import './ToolCallBlock/index.less'
import './ClarifyBlock/index.less'

interface ConversationBlocksProps {
  blocks: ChatBlock[]
  isStreaming: boolean
  thinkingTool: string | null
  onClarifyContinue?: () => void
}

const Streamdown = lazy(() => import('streamdown').then(({ Streamdown: Component }) => ({ default: Component })))

export function ConversationBlocks({ blocks, isStreaming, thinkingTool, onClarifyContinue }: ConversationBlocksProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const contentBlocks = blocks.filter((block) => block.type !== 'citations')
  const citationBlocks = blocks.filter(
    (block): block is Extract<ChatBlock, { type: 'citations' }> => block.type === 'citations',
  )

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [blocks])

  return (
    <>
      {contentBlocks.map((block, i) => {
        if (block.type === 'text') {
          const isLastText = i === contentBlocks.length - 1 && isStreaming
          return (
            <div key={i} className="text-block">
              <Suspense fallback={<p className="assistant-markdown">{block.content}</p>}>
                <Streamdown
                  className="assistant-markdown"
                  mode="streaming"
                  shikiTheme={['github-dark', 'github-dark']}
                  isAnimating={isLastText}
                >
                  {block.content}
                </Streamdown>
              </Suspense>
              {isLastText && <span className="cursor" aria-label="正在生成" />}
            </div>
          )
        }
        if (block.type === 'tool') {
          return <ToolCallBlock key={i} block={block} isLast={i === contentBlocks.length - 1} />
        }
        if (block.type === 'clarify') {
          return <ClarifyBlock key={i} block={block} onContinue={() => onClarifyContinue?.()} />
        }
        return null
      })}
      {thinkingTool && contentBlocks.length > 0 && contentBlocks[contentBlocks.length - 1]?.type === 'text' && (
        <div className="thinking-indicator">
          <LoaderCircle size={12} className="spin" />
          <span>{thinkingTool}</span>
        </div>
      )}
      {citationBlocks.map((block, blockIndex) => (
        <div className="citation-block" key={`citations-${blockIndex}`}>
          {block.citations.map((citation, index) => (
            <p key={`${citation.source}-${index}`}>
              {citation.number}. （来源：
              <a href={sourceFileUrl(citation.source)} target="_blank" rel="noreferrer">
                {citation.source}
              </a>
              ）
            </p>
          ))}
        </div>
      ))}
      <div ref={bottomRef} />
    </>
  )
}
