import type { ReactNode } from 'react'
import {
  BookOpen, Image, LayoutDashboard, Megaphone, MessageSquareText,
  PenLine, ShieldCheck, Users,
} from 'lucide-react'

export type Tab = 'overview' | 'users' | 'sessions' | 'images' | 'rewrites' | 'paradigm' | 'admins' | 'announcements'

export const tabConfig: Array<{ key: Tab; label: string; icon: ReactNode }> = [
  { key: 'overview', label: '运营看板', icon: <LayoutDashboard size={17} /> },
  { key: 'users', label: '用户管理', icon: <Users size={17} /> },
  { key: 'sessions', label: 'AI 聊天数据', icon: <MessageSquareText size={17} /> },
  { key: 'images', label: 'AI 生图数据', icon: <Image size={17} /> },
  { key: 'rewrites', label: 'AI 仿写数据', icon: <PenLine size={17} /> },
  { key: 'paradigm', label: '范式萃取', icon: <BookOpen size={17} /> },
  { key: 'announcements', label: '系统公告', icon: <Megaphone size={17} /> },
  { key: 'admins', label: '管理员', icon: <ShieldCheck size={17} /> },
]
