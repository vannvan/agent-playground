import { LogOut, MessageCircle, PenLine, Plus, Sparkles, Trash2 } from 'lucide-react'
import { Avatar, Tooltip } from '@lobehub/ui'
import type { ChatSession, RewriteHistoryItem, SettingsTab, User } from '../../types'
import { useNavigate  } from 'react-router-dom'
import './index.less'

interface SidebarProps {
  user: User | null
  mode: 'chat' | 'image' | 'rewrite'
  setMode: (m: 'chat' | 'image' | 'rewrite') => void
  chats: ChatSession[]
  activeChatId: string
  rewrites: RewriteHistoryItem[]
  activeRewriteId: string
  onSelectChat: (id: string) => void
  onDeleteChat: (id: string) => void
  onSelectRewrite: (id: string) => void
  onCreateChat: () => void
  onCreateRewrite: () => void
  onOpenSettings: () => void
  onSignOut: () => void
  onSetSettingsTab: (tab: SettingsTab) => void
}

export function Sidebar({
  user, mode, setMode, chats, activeChatId, rewrites, activeRewriteId,
  onSelectChat, onDeleteChat, onSelectRewrite, onCreateChat, onCreateRewrite,
  onOpenSettings, onSignOut, onSetSettingsTab,
}: SidebarProps) {
  const navigate = useNavigate();
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark"><Sparkles size={16} /></span>
        <strong>灵感工坊</strong>
        <span className="version">AI STUDIO</span>
      </div>

      {/* Mode tabs */}
      <nav className="mode-nav" aria-label="功能模式">
        <button type="button" className={`mode-link${mode === 'chat' ? ' active' : ''}`} onClick={() => setMode('chat')}>
          <MessageCircle size={15} /><span>聊天</span>
        </button>
        <button type="button" className={`mode-link${mode === 'rewrite' ? ' active' : ''}`} onClick={() => setMode('rewrite')}>
          <PenLine size={15} /><span>仿写</span>
        </button>
        <button type="button" className={`mode-link${mode === 'image' ? ' active' : ''}`} onClick={() => setMode('image')} >
          <span>🎨</span><span>生图</span>
        </button>
        <button type="button" className='mode-link' onClick={() => navigate('/review')}>
          <span>📚</span><span>润色</span>
        </button>
      </nav>

      {/* Chat history */}
      {mode === 'chat' && <section className="chat-history">
        <div className="chat-history-heading">
          <span>最近对话</span>
          <button type="button" aria-label="新建对话" title="新建对话" onClick={onCreateChat}><Plus size={15} /></button>
        </div>
        <div className="chat-history-list">
          {chats.map((chat) => (
            <div key={chat.chatId} className={`chat-history-item-wrap${chat.chatId === activeChatId ? ' active' : ''}`}>
              <button type="button"
                className={`chat-history-item${chat.chatId === activeChatId ? ' active' : ''}`}
                onClick={() => onSelectChat(chat.chatId)}
              >
                <MessageCircle size={14} /><span>{chat.title || '新对话'}</span>
              </button>
              <Tooltip title="删除会话" placement="top">
                <button
                  type="button"
                  className="chat-history-delete"
                  aria-label={`删除会话 ${chat.title || '新对话'}`}
                  onClick={() => onDeleteChat(chat.chatId)}
                >
                  <Trash2 size={13} />
                </button>
              </Tooltip>
            </div>
          ))}
          {chats.length === 0 && <p className="chat-history-empty">你的对话会显示在这里</p>}
        </div>
      </section>}

      {/* Rewrite history */}
      {mode === 'rewrite' && <section className="chat-history">
        <div className="chat-history-heading">
          <span>最近仿写</span>
          <button type="button" aria-label="新建仿写" title="新建仿写" onClick={onCreateRewrite}><Plus size={15} /></button>
        </div>
        <div className="chat-history-list">
          {rewrites.map((rw) => (
            <button key={rw.id} type="button"
              className={`chat-history-item${rw.id === activeRewriteId ? ' active' : ''}`}
              onClick={() => onSelectRewrite(rw.id)}
            >
              <PenLine size={14} /><span>{rw.author} · {rw.topic}</span>
            </button>
          ))}
          {rewrites.length === 0 && <p className="chat-history-empty">生成的文章会显示在这里</p>}
        </div>
      </section>}

      <div className="sidebar-bottom">
        <Tooltip title="打开设置" placement="top">
          <Avatar
            className="user-avatar-btn"
            size={38}
            avatar={user ? user.email[0].toUpperCase() : '?'}
            onClick={() => { onOpenSettings(); onSetSettingsTab('model') }}
          />
        </Tooltip>
        <button className="logout-button" type="button" onClick={onSignOut} aria-label="退出登录" title="退出登录">
          <LogOut size={14} />
        </button>
      </div>
    </aside>
  )
}
