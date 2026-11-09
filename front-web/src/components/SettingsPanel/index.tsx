import { Palette, Settings2, UserRound, X } from 'lucide-react'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { ModelConfig, SettingsTab } from '../../types'
import { ModelSettingsTab } from './ModelSettingsTab'
import { PersonalizationSettingsTab } from './PersonalizationSettingsTab'
import { ThemeSettingsTab } from './ThemeSettingsTab'
import './index.less'

interface SettingsPanelProps {
  config: ModelConfig
  draftConfig: ModelConfig
  configError: string
  connectionTestResult: { success: boolean; durationMs?: number; message: string } | null
  connectionTestBusy: boolean
  isSettingsOpen: boolean
  settingsTab: SettingsTab
  onClose: () => void
  onUpdateConfig: (field: keyof ModelConfig, value: string) => void
  onSaveConfig: () => void
  onTestConnection: () => void
  onSetSettingsTab: (tab: SettingsTab) => void
}

const SETTINGS_TABS: { id: SettingsTab; label: string; icon: typeof Settings2 }[] = [
  { id: 'model', label: '模型设置', icon: Settings2 },
  { id: 'theme', label: '主题', icon: Palette },
  { id: 'personalization', label: '个性化', icon: UserRound },
]

export function SettingsPanel({
  config,
  draftConfig,
  configError,
  connectionTestResult,
  connectionTestBusy,
  isSettingsOpen,
  settingsTab,
  onClose,
  onUpdateConfig,
  onSaveConfig,
  onTestConnection,
  onSetSettingsTab,
}: SettingsPanelProps) {
  useEffect(() => {
    if (!isSettingsOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isSettingsOpen, onClose])

  if (!isSettingsOpen) return null

  const activeTab = SETTINGS_TABS.find((tab) => tab.id === settingsTab) ?? SETTINGS_TABS[0]

  return createPortal(
    <div
      className="app-settings-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="app-settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-settings-title"
      >
        <header className="app-settings-header">
          <div>
            <span className="app-settings-eyebrow">PREFERENCES</span>
            <h2 id="app-settings-title">设置</h2>
          </div>
          <button className="app-settings-close" type="button" aria-label="关闭设置" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="app-settings-tabs" role="tablist" aria-label="设置分类">
          {SETTINGS_TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              id={`settings-tab-${id}`}
              className={`app-settings-tab${settingsTab === id ? ' active' : ''}`}
              type="button"
              role="tab"
              aria-selected={settingsTab === id}
              aria-controls="app-settings-tabpanel"
              onClick={() => onSetSettingsTab(id)}
            >
              <Icon size={15} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div
          className="app-settings-content"
          id="app-settings-tabpanel"
          role="tabpanel"
          aria-labelledby={`settings-tab-${activeTab.id}`}
        >
          {settingsTab === 'model' && (
            <ModelSettingsTab
              config={config}
              draftConfig={draftConfig}
              configError={configError}
              connectionTestResult={connectionTestResult}
              connectionTestBusy={connectionTestBusy}
              onUpdateConfig={onUpdateConfig}
              onSaveConfig={onSaveConfig}
              onTestConnection={onTestConnection}
            />
          )}
          {settingsTab === 'theme' && <ThemeSettingsTab />}
          {settingsTab === 'personalization' && <PersonalizationSettingsTab />}
        </div>
      </section>
    </div>,
    document.body,
  )
}