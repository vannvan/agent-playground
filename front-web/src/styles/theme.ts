/**
 * 自定义 Lobe 主题 — 保持原有配色方案不变
 * @ink #252b45  @paper #e1e6fc  @lime #b5c2ff  @orange #788df0  @line #d4daf0
 */
import { setLobeTheme } from '@lobehub/ui'

export function initLobeTheme() {
  setLobeTheme({
    appearance: 'light',
    primaryColor: '#788df0',
    neutralColor: 'slate',
  }, document.documentElement)
}
