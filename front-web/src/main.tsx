import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { ConfigProvider } from '@lobehub/ui'
import './index.css'
import './styles/lobe-theme.css'
import '@lobehub/ui/style.css'
import { initLobeTheme } from './styles/theme'
import { router } from './router'

initLobeTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider motion={undefined as any}>
      <RouterProvider router={router} />
    </ConfigProvider>
  </StrictMode>,
)
