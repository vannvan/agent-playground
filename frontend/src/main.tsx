import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import App from './App.tsx'
import ManuscriptReviewPage from './features/ManuscriptReviewPage.tsx'
import RagPage from './features/RagPage.tsx'
import AdminLayout from './admin/AdminLayout.tsx'
import ControlCenter from './admin/ControlCenter/index.tsx'
import UserManage from './admin/UserManage/index.tsx'
import ChatData from './admin/ChatData/index.tsx'
import ImageData from './admin/ImageData/index.tsx'
import RewriteData from './admin/RewriteData/index.tsx'
import ParadigmExtract from './admin/ParadigmExtract/index.tsx'
import AnnouncementManage from './admin/AnnouncementManage/index.tsx'
import AdminManage from './admin/AdminManage/index.tsx'

const router = createBrowserRouter([
  { path: '/', element: <App /> },
  { path: '/review', element: <ManuscriptReviewPage /> },
  { path: '/rag', element: <RagPage /> },
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      { index: true, element: <Navigate to="overview" replace /> },
      { path: 'overview', element: <ControlCenter /> },
      { path: 'users', element: <UserManage /> },
      { path: 'sessions', element: <ChatData /> },
      { path: 'images', element: <ImageData /> },
      { path: 'rewrites', element: <RewriteData /> },
      { path: 'paradigm', element: <ParadigmExtract /> },
      { path: 'announcements', element: <AnnouncementManage /> },
      { path: 'admins', element: <AdminManage /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
