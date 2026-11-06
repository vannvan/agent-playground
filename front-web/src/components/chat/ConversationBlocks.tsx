import { Suspense, useEffect, useRef,lazy } from 'react'
import { LoaderCircle } from 'lucide-react'
// import Streamdown from 'streamdown'
import type { ChatBlock } from '../../types'
import { ToolCallBlock } from './ToolCallBlock'
import { ClarifyBlock } from './ClarifyBlock'

interface ConversationBlocksProps {
  blocks: ChatBlock[]
  isStreaming: boolean
  thinkingTool: string | null
  onClarifyContinue?: () => void
}

const Streamdown = lazy(() => import('streamdown').then(({ Streamdown: Component }) => ({ default: Component })))

export function ConversationBlocks({ blocks, isStreaming, thinkingTool, onClarifyContinue }: ConversationBlocksProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [blocks])

  return (
    <>
      {blocks.map((block, i) => {
        if (block.type === 'text') {
          const isLastText = i === blocks.length - 1 && isStreaming
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
          return <ToolCallBlock key={i} block={block} isLast={i === blocks.length - 1} />
        }
        if (block.type === 'clarify') {
          return <ClarifyBlock key={i} block={block} onContinue={() => onClarifyContinue?.()} />
        }
        return null
      })}
      {thinkingTool && blocks.length > 0 && blocks[blocks.length - 1]?.type === 'text' && (
        <div className="thinking-indicator">
          <LoaderCircle size={12} className="spin" />
          <span>{thinkingTool}</span>
        </div>
      )}
      <div ref={bottomRef} />
    </>
  )
}
