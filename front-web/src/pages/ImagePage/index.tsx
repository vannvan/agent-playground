import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ImagePlus,
  LoaderCircle,
  Sparkles,
  X,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Select from '../../components/Select'
import { imagesApi } from '../../services/api'
import type { GeneratedImage, ModelConfig, SettingsTab, User } from '../../types'
import './index.less'

interface ImagePageProps {
  user: User | null
  config: ModelConfig
  generatedImages: GeneratedImage[]
  setGeneratedImages: React.Dispatch<React.SetStateAction<GeneratedImage[]>>
  expandedPromptIds: Set<string>
  setExpandedPromptIds: React.Dispatch<React.SetStateAction<Set<string>>>
  previewIndex: number | null
  setPreviewIndex: React.Dispatch<React.SetStateAction<number | null>>
  imageError: string
  setImageError: React.Dispatch<React.SetStateAction<string>>
  onOpenSettings: () => void
  onSetSettingsTab: (tab: SettingsTab) => void
}

export function ImagePage({
  user, config,
  generatedImages, setGeneratedImages,
  expandedPromptIds, setExpandedPromptIds,
  previewIndex, setPreviewIndex,
  imageError, setImageError,
  onOpenSettings, onSetSettingsTab,
}: ImagePageProps) {
  const navigate = useNavigate()
  const [imagePrompt, setImagePrompt] = useState('')
  const [imageSize, setImageSize] = useState('1024x1024')
  const [imageUrl, setImageUrl] = useState('')
  const [isGeneratingImage, setIsGeneratingImage] = useState(false)

  useEffect(() => {
    if (!user) navigate('/')
  }, [user, navigate])

  async function generateImage(event: FormEvent) {
    event.preventDefault()
    if (!imagePrompt.trim() || isGeneratingImage) return
    if (!hasCompleteConfig(config)) {
      onOpenSettings()
      onSetSettingsTab('model')
      return
    }
    if (!config.imageModel.trim()) {
      onOpenSettings()
      onSetSettingsTab('model')
      return
    }
    setIsGeneratingImage(true)
    setImageError('')
    setImageUrl('')
    try {
      const result = await imagesApi.generate(imagePrompt.trim(), imageSize)
      if (!result.url) throw new Error('模型没有返回可用的图片')
      setImageUrl(result.url)
      setGeneratedImages((images) => [{ id: result.id, url: result.url, prompt: imagePrompt.trim() }, ...images])
    } catch (e) {
      setImageError(e instanceof Error ? e.message : '图片生成请求失败')
    } finally {
      setIsGeneratingImage(false)
    }
  }

  useEffect(() => {
    if (previewIndex === null) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function handlePreviewKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setPreviewIndex(null)
      if (event.key === 'ArrowLeft') {
        setPreviewIndex((current) => current === null ? null : (current - 1 + generatedImages.length) % generatedImages.length)
      }
      if (event.key === 'ArrowRight') {
        setPreviewIndex((current) => current === null ? null : (current + 1) % generatedImages.length)
      }
    }
    window.addEventListener('keydown', handlePreviewKeyDown)
    return () => {
      window.removeEventListener('keydown', handlePreviewKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [previewIndex, generatedImages.length])

  const previewImage = previewIndex === null ? undefined : generatedImages[previewIndex]

  return (
    <div className="image-workspace">
      <div className="image-canvas">
        {imageUrl ? (
          <button
            className="image-preview-trigger"
            type="button"
            onClick={() => {
              const index = generatedImages.findIndex((image) => image.url === imageUrl)
              if (index >= 0) setPreviewIndex(index)
            }}
            aria-label="放大预览图片"
            title="点击放大预览"
          >
            <img src={imageUrl} alt={imagePrompt} />
          </button>
        ) : (
          <div className="canvas-placeholder">
            {isGeneratingImage ? (
              <LoaderCircle className="spin" size={28} />
            ) : (
              <>
                <div className="placeholder-art">
                  <span /><span /><span /><ImagePlus size={24} />
                </div>
                <b>你的作品将在这里呈现</b>
                <small>输入描述词，开始第一次创作</small>
              </>
            )}
            {isGeneratingImage && <>
              <b>正在绘制你的灵感…</b>
              <small>通常需要一些时间，请稍候</small>
            </>}
          </div>
        )}
        {imageUrl && <a className="download-image" href={imageUrl} download="agnes-ai-image.png" target="_blank" rel="noreferrer"><Download size={15} /> 下载图片</a>}
      </div>

      {imageError && <p className="image-error">{imageError}</p>}

      <form className="image-composer" onSubmit={generateImage}>
        <label htmlFor="image-prompt">描述你想生成的画面</label>
        <textarea id="image-prompt" value={imagePrompt} onChange={(e) => setImagePrompt(e.target.value)} placeholder="例如：雨后宁静的京都小巷，暖色胶片质感，路面倒映着纸灯笼…" rows={3} />
        <div className="image-composer-bottom">
          <label className="size-select-label" htmlFor="image-size">图片尺寸
            <Select id="image-size" size="compact" wrapperClassName="image-size-select" value={imageSize} onValueChange={setImageSize} options={[
              { value: '512x512', label: '512 × 512 · 小方图' },
              { value: '768x768', label: '768 × 768 · 标准方图' },
              { value: '1024x1024', label: '1024 × 1024 · 高清方图' },
              { value: '1024x1536', label: '1024 × 1536 · 竖版' },
              { value: '1536x1024', label: '1536 × 1024 · 横版' },
              { value: '1024x1792', label: '1024 × 1792 · 长竖版' },
              { value: '1792x1024', label: '1792 × 1024 · 宽横版' },
            ]} />
          </label>
          <button className="generate-button" type="submit" disabled={!imagePrompt.trim() || isGeneratingImage}>
            {isGeneratingImage ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
            {isGeneratingImage ? '生成中…' : '生成图片'}
          </button>
        </div>
      </form>

      {generatedImages.length > 0 && <section className="image-gallery" aria-label="生成图片画廊">
        <div className="gallery-heading">
          <div><h4>作品画廊</h4><span>本次创作 · {generatedImages.length} 张</span></div>
          <span className="gallery-hint">点击缩略图再次查看</span>
        </div>
        <div className="gallery-grid">
          {generatedImages.map((image, index) => {
            const isPromptExpanded = expandedPromptIds.has(image.id)
            return <article className={image.url === imageUrl ? 'gallery-item selected' : 'gallery-item'} key={image.id}>
              <button
                className="gallery-image-button"
                type="button"
                onClick={() => {
                  setImageUrl(image.url)
                  setImagePrompt(image.prompt)
                  setImageError('')
                  setPreviewIndex(index)
                }}
                aria-label={`预览第 ${generatedImages.length - index} 张图片`}
                aria-pressed={image.url === imageUrl}
              >
                <img src={image.url} alt={image.prompt} />
                <span className="gallery-preview-hint">点击预览</span>
              </button>
              <div className="gallery-prompt">
                <p className={isPromptExpanded ? 'expanded' : ''}>{image.prompt}</p>
                {image.prompt.length > 60 && <button
                  type="button"
                  onClick={() => setExpandedPromptIds((current) => {
                    const next = new Set(current)
                    if (next.has(image.id)) next.delete(image.id)
                    else next.add(image.id)
                    return next
                  })}
                  aria-expanded={isPromptExpanded}
                >{isPromptExpanded ? '收起' : '展开'}</button>}
              </div>
            </article>
          })}
        </div>
      </section>}

      <div className="image-footer"><span>POWERED BY AGNES AI</span><span>提示：描述越具体，生成效果越贴近你的想象</span></div>

      {previewImage && createPortal(
        <div className="lightbox-backdrop" onClick={(event) => {
          if (event.target === event.currentTarget) setPreviewIndex(null)
        }}>
          <section className="lightbox-panel" role="dialog" aria-modal="true" aria-label="图片预览">
            <header className="lightbox-header">
              <div className="lightbox-caption">
                <span>IMAGE PREVIEW <i>{previewIndex! + 1} / {generatedImages.length}</i></span>
                <p>{previewImage.prompt}</p>
              </div>
              <div className="lightbox-actions">
                <a href={previewImage.url} download="agnes-ai-image.png" target="_blank" rel="noreferrer" aria-label="下载图片" title="下载图片"><Download size={17} /></a>
                <button type="button" autoFocus onClick={() => setPreviewIndex(null)} aria-label="关闭预览" title="关闭预览"><X size={19} /></button>
              </div>
            </header>
            <div className="lightbox-stage">
              {generatedImages.length > 1 && <button className="lightbox-nav previous" type="button" onClick={() => setPreviewIndex((current) => current === null ? null : (current - 1 + generatedImages.length) % generatedImages.length)} aria-label="上一张"><ChevronLeft size={22} /></button>}
              <img src={previewImage.url} alt={previewImage.prompt} />
              {generatedImages.length > 1 && <button className="lightbox-nav next" type="button" onClick={() => setPreviewIndex((current) => current === null ? null : (current + 1) % generatedImages.length)} aria-label="下一张"><ChevronRight size={22} /></button>}
            </div>
            <p className="lightbox-shortcut">ESC 关闭 <span>← → 切换图片</span></p>
          </section>
        </div>,
        document.body,
      )}
    </div>
  )
}

function hasCompleteConfig(config: ModelConfig) {
  return Boolean((config.apiKey.trim() || config.hasApiKey) && config.baseUrl.trim() && config.textModel.trim())
}
