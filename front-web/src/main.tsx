import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { ConfigProvider } from '@lobehub/ui'
import { motion } from 'motion/react'
import './index.css'
import './styles/lobe-theme.css'
import '@lobehub/ui/style.css'
import { initLobeTheme } from './styles/theme'
import { router } from './router'

initLobeTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider motion={motion as never}>
      <RouterProvider router={router} />
    </ConfigProvider>
  </StrictMode>,
)
