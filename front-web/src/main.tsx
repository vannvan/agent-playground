import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import App from './App.tsx'
import ManuscriptReviewPage from './features/ManuscriptReviewPage.tsx'
import RagPage from './features/RagPage.tsx'

const router = createBrowserRouter([
  { path: '/', element: <App /> },
  { path: '/review', element: <ManuscriptReviewPage /> },
  { path: '/rag', element: <RagPage /> },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
