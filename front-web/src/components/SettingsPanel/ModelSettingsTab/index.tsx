import { LoaderCircle } from 'lucide-react'
import type { ModelConfig } from '../../../types'
import './index.less'

interface ModelSettingsTabProps {
  config: ModelConfig
  draftConfig: ModelConfig
  configError: string
  connectionTestResult: { success: boolean; durationMs?: number; message: string } | null
  connectionTestBusy: boolean
  onUpdateConfig: (field: keyof ModelConfig, value: string) => void
  onSaveConfig: () => void
  onTestConnection: () => void
}

export function ModelSettingsTab({
  config,
  draftConfig,
  configError,
  connectionTestResult,
  connectionTestBusy,
  onUpdateConfig,
  onSaveConfig,
  onTestConnection,
}: ModelSettingsTabProps) {
  return (
    <div className="model-settings-tab">
      <label>
        API Key
        <input
          value={draftConfig.apiKey}
          onChange={(event) => onUpdateConfig('apiKey', event.target.value)}
          placeholder={config.hasApiKey ? `已保存 ${config.maskedApiKey ?? '密钥'}，输入新值可替换` : '填写服务商提供的 API Key'}
          autoComplete="new-password"
        />
      </label>
      <label>
        Base URL
        <input
          value={draftConfig.baseUrl}
          onChange={(event) => onUpdateConfig('baseUrl', event.target.value)}
          placeholder="填写 OpenAI 兼容接口根地址"
        />
      </label>
      <label>
        文本模型名称
        <input
          value={draftConfig.textModel}
          onChange={(event) => onUpdateConfig('textModel', event.target.value)}
          placeholder="例如：服务商提供的文本模型 ID"
        />
      </label>
      <label>
        图像模型名称（可选）
        <input
          value={draftConfig.imageModel}
          onChange={(event) => onUpdateConfig('imageModel', event.target.value)}
          placeholder="填写服务商提供的图像模型 ID"
        />
      </label>
      <label>
        视频模型名称（可选）
        <input
          value={draftConfig.videoModel}
          onChange={(event) => onUpdateConfig('videoModel', event.target.value)}
          placeholder="填写服务商提供的视频模型 ID"
        />
      </label>
      {configError && <p className="model-settings-error">{configError}</p>}
      {connectionTestResult && (
        <p
          className={`model-connection-result ${connectionTestResult.success ? 'success' : 'failure'}`}
          role="status"
        >
          {connectionTestResult.message}
          {connectionTestResult.durationMs !== undefined && ` · ${connectionTestResult.durationMs} ms`}
        </p>
      )}
      <button
        className="model-settings-test"
        type="button"
        onClick={onTestConnection}
        disabled={
          connectionTestBusy ||
          !(draftConfig.apiKey.trim() || draftConfig.hasApiKey) ||
          !draftConfig.baseUrl.trim() ||
          !draftConfig.textModel.trim()
        }
      >
        {connectionTestBusy ? (
          <><LoaderCircle className="spin" size={14} />测试中…</>
        ) : (
          '测试文本模型连通性'
        )}
      </button>
      <button className="model-settings-save" type="button" onClick={onSaveConfig}>
        保存配置
      </button>
      <p className="model-settings-note">
        API Key 仅由服务端加密保存。连通性测试会发送一条最小文本请求，可能产生少量费用；图像和视频模型名称仅保存配置，不会在此测试。
      </p>
    </div>
  )
}