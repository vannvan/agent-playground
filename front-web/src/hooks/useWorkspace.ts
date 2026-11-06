import { useEffect, useState, useCallback } from 'react'
import { authApi, chatsApi, imagesApi, modelConfigApi, announcementsApi, rewritesApi } from '../services/api'
import type { User, ModelConfig, ChatSession, RewriteHistoryItem, SystemAnnouncement, GeneratedImage } from '../types'

const DEFAULT_CONFIG: ModelConfig = { apiKey: '', baseUrl: '', textModel: '', imageModel: '', videoModel: '', hasApiKey: false }

export function useWorkspace() {
  const [user, setUser] = useState<User | null>(null)
  const [isAuthLoading, setIsAuthLoading] = useState(true)
  const [config, setConfig] = useState<ModelConfig>(DEFAULT_CONFIG)
  const [draftConfig, setDraftConfig] = useState<ModelConfig>(DEFAULT_CONFIG)
  const [chats, setChats] = useState<ChatSession[]>([])
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([])
  const [announcements, setAnnouncements] = useState<SystemAnnouncement[]>([])
  const [rewrites, setRewrites] = useState<RewriteHistoryItem[]>([])
  const [activeRewriteId, setActiveRewriteId] = useState('')
  const [imagePrompt, setImagePrompt] = useState('')
  const [imageSize, setImageSize] = useState('1024x1024')
  const [imageUrl, setImageUrl] = useState('')
  const [expandedPromptIds, setExpandedPromptIds] = useState<Set<string>>(() => new Set())
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [imageError, setImageError] = useState('')
  const [isGeneratingImage, setIsGeneratingImage] = useState(false)

  const loadWorkspace = useCallback(async (_userId: number) => {
    try {
      const [savedConfig, savedChats, savedImages, savedAnnouncements, savedRewrites] = await Promise.all([
        modelConfigApi.get(),
        chatsApi.list(),
        imagesApi.list(),
        announcementsApi.list(),
        rewritesApi.history(),
      ])
      const nextConfig = { ...DEFAULT_CONFIG, ...savedConfig, apiKey: '' }
      setConfig(nextConfig)
      setDraftConfig(nextConfig)
      setChats(savedChats)
      setGeneratedImages(savedImages)
      setAnnouncements(savedAnnouncements)
      setRewrites(savedRewrites)
      setActiveRewriteId(savedRewrites[0]?.id ?? '')
      if (savedImages[0]) {
        setImageUrl(savedImages[0].url)
        setImagePrompt(savedImages[0].prompt)
      }
    } catch {
      // silently ignore — auth will show error
    }
  }, [])

  useEffect(() => {
    let active = true
    authApi.me()
      .then((r) => {
        if (active) {
          setUser(r?.user ?? null)
          if (r?.user) void loadWorkspace(r.user.id)
        }
      })
      .catch(() => { if (active) setUser(null) })
      .finally(() => { if (active) setIsAuthLoading(false) })
    return () => { active = false }
  }, [loadWorkspace])

  // Refresh announcements every 60s
  useEffect(() => {
    if (!user) return
    const timer = window.setInterval(() => {
      announcementsApi.list().then(setAnnouncements).catch(() => {})
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [user])

  async function signOut() {
    await authApi.logout().catch(() => undefined)
    setUser(null)
    setChats([])
    setRewrites([])
    setActiveRewriteId('')
    setGeneratedImages([])
    setAnnouncements([])
  }

  return {
    user, isAuthLoading, config, setConfig, draftConfig, setDraftConfig,
    chats, setChats, generatedImages, setGeneratedImages,
    announcements, setAnnouncements, rewrites, setRewrites,
    activeRewriteId, setActiveRewriteId,
    imagePrompt, setImagePrompt, imageSize, setImageSize,
    imageUrl, setImageUrl, expandedPromptIds, setExpandedPromptIds,
    previewIndex, setPreviewIndex, imageError, setImageError,
    isGeneratingImage, setIsGeneratingImage,
    signOut, loadWorkspace,
  }
}
