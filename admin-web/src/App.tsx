import { Navigate, Route, Routes } from 'react-router-dom'
import AdminLayout from './admin/AdminLayout'
import ControlCenter from './admin/ControlCenter'
import UserManage from './admin/UserManage'
import ChatData from './admin/ChatData'
import ImageData from './admin/ImageData'
import RewriteData from './admin/RewriteData'
import ParadigmExtract from './admin/ParadigmExtract'
import AnnouncementManage from './admin/AnnouncementManage'
import AdminManage from './admin/AdminManage'

export default function App() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<ControlCenter />} />
        <Route path="users" element={<UserManage />} />
        <Route path="sessions" element={<ChatData />} />
        <Route path="images" element={<ImageData />} />
        <Route path="rewrites" element={<RewriteData />} />
        <Route path="paradigm" element={<ParadigmExtract />} />
        <Route path="announcements" element={<AnnouncementManage />} />
        <Route path="admins" element={<AdminManage />} />
      </Route>
      <Route path="*" element={<Navigate to="/overview" replace />} />
    </Routes>
  )
}
