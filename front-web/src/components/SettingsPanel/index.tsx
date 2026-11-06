import { Settings2, X, LoaderCircle } from 'lucide-react'
import { createPortal } from 'react-dom'

import type { ModelConfig } from '../../types'

interface SettingsPanelProps {
  config: ModelConfig
  draftConfig: ModelConfig
  configError: string
  connectionTestResult: { success: boolean; durationMs?: number; message: string } | null
  connectionTestBusy: boolean
  isSettingsOpen: boolean
  settingsTab: 'model' | 'profile'
  onClose: () => void
  onUpdateConfig: (field: keyof ModelConfig, value: string) => void
  onSaveConfig: () => void
  onTestConnection: () => void
  onSetSettingsTab: (tab: 'model' | 'profile') => void
}

export function SettingsPanel({
  config, draftConfig, configError, connectionTestResult, connectionTestBusy,
  isSettingsOpen, settingsTab, onClose, onUpdateConfig, onSaveConfig, onTestConnection, onSetSettingsTab,
}: SettingsPanelProps) {
  if (!isSettingsOpen) return null
  return createPortal(
    <div className="settings-panel" role="dialog" aria-label="设置">
      <div className="settings-heading">
        <div>
          <span className="eyebrow">SETTINGS</span>
          <h3>{settingsTab === 'model' ? '模型连接' : '个性化设置'}</h3>
        </div>
        <button className="icon-button" type="button" aria-label="关闭配置" onClick={onClose}>
          <X size={17} />
        </button>
      </div>
      <div className="settings-tabs">
        <button type="button" className={`settings-tab${settingsTab === 'model' ? ' active' : ''}`} onClick={() => onSetSettingsTab('model')}>
          <Settings2 size={13} /><span>模型连接</span>
        </button>
        <button type="button" className={`settings-tab${settingsTab === 'profile' ? ' active' : ''}`} onClick={() => onSetSettingsTab('profile')} disabled>
          <span>个性化设置</span><sup>即将上线</sup>
        </button>
      </div>
      {settingsTab === 'model' && <>
        <label>
          API Key
          <input value={draftConfig.apiKey} onChange={(e) => onUpdateConfig('apiKey', e.target.value)} placeholder={config.hasApiKey ? `已保存 ${config.maskedApiKey ?? '密钥'}，输入新值可替换` : '填写服务商提供的 API Key'} autoComplete="new-password" />
        </label>
        <label>
          Base URL
          <input value={draftConfig.baseUrl} onChange={(e) => onUpdateConfig('baseUrl', e.target.value)} placeholder="填写 OpenAI 兼容接口根地址" />
        </label>
        <label>
          文本模型名称
          <input value={draftConfig.textModel} onChange={(e) => onUpdateConfig('textModel', e.target.value)} placeholder="例如：服务商提供的文本模型 ID" />
        </label>
        <label>
          图像模型名称（可选）
          <input value={draftConfig.imageModel} onChange={(e) => onUpdateConfig('imageModel', e.target.value)} placeholder="填写服务商提供的图像模型 ID" />
        </label>
        <label>
          视频模型名称（可选）
          <input value={draftConfig.videoModel} onChange={(e) => onUpdateConfig('videoModel', e.target.value)} placeholder="填写服务商提供的视频模型 ID" />
        </label>
        {configError && <p className="settings-error">{configError}</p>}
        {connectionTestResult && (
          <p className={connectionTestResult.success ? 'connection-test-result success' : 'connection-test-result failure'} role="status">
            {connectionTestResult.message}{connectionTestResult.durationMs !== undefined && ` · ${connectionTestResult.durationMs} ms`}
          </p>
        )}
        <button className="test-connection" type="button" onClick={onTestConnection} disabled={connectionTestBusy || !(draftConfig.apiKey.trim() || draftConfig.hasApiKey) || !draftConfig.baseUrl.trim() || !draftConfig.textModel.trim()}>
          {connectionTestBusy ? <><LoaderCircle className="spin" size={14} />测试中…</> : '测试文本模型连通性'}
        </button>
        <button className="save-settings" type="button" onClick={onSaveConfig}>保存配置</button>
        <p className="settings-note">API Key 仅由服务端加密保存。连通性测试会发送一条最小文本请求，可能产生少量费用；图像和视频模型名称仅保存配置，不会在此测试。</p>
      </>}
      {settingsTab === 'profile' && <div className="settings-empty">
        <span className="eyebrow">COMING SOON</span>
        <p>个性化设置即将上线，敬请期待。</p>
      </div>}
    </div>,
    document.body,
  )
}
