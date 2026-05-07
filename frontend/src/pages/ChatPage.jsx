import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getHistory, editMessage, deleteMessage } from '../api/messages'
import { getRoom, getRoomMembers, getRoomSeen } from '../api/rooms'
import { useAuth } from '../context/AuthContext'
import { useChatSocket } from '../hooks/useChatSocket'
import { usePresence } from '../hooks/usePresence'
import MessageList from '../components/MessageList'
import MessageInput from '../components/MessageInput'
import PresenceBadge from '../components/PresenceBadge'
import TypingIndicator from '../components/TypingIndicator'
import ThemeToggle from '../components/ThemeToggle'

function BackIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
    </svg>
  )
}

export default function ChatPage() {
  const { roomId } = useParams()
  const { token, username } = useAuth()
  const navigate = useNavigate()
  const [allMessages, setAllMessages] = useState([])
  const [roomName, setRoomName] = useState('')
  const [seenMap, setSeenMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [initialSeenId, setInitialSeenId] = useState(null)
  const messageInputRef = useRef(null)

  function handleSeen(data) {
    if (data.username !== username) {
      setSeenMap(prev => ({ ...prev, [data.username]: data.message_id }))
    }
  }

  function applyEdit(id, body, edited_at) {
    setAllMessages(prev => prev.map(m => m.id === id ? { ...m, body, edited_at } : m))
  }

  function applyDelete(id) {
    setAllMessages(prev => prev.map(m => m.id === id ? { ...m, deleted: true, body: '' } : m))
  }

  async function handleEdit(msg, newBody) {
    setEditingId(null)
    messageInputRef.current?.focus()
    if (!newBody.trim() || newBody === msg.body) return
    try {
      await editMessage(roomId, msg.id, newBody.trim())
    } catch {}
  }

  function handleEditLast() {
    const last = [...allMessages].reverse().find(m => m.username === username && !m.deleted)
    if (last) setEditingId(last.id)
  }

  async function handleDelete(msgId) {
    try {
      await deleteMessage(roomId, msgId)
    } catch {}
  }

  const { members, setMembers, handlePresenceEvent } = usePresence([])
  const { messages, typingUsers, send, sendTyping, sendSeen } = useChatSocket(
    roomId, token, handlePresenceEvent, handleSeen, applyEdit, applyDelete, initialSeenId
  )

  useEffect(() => {
    return () => {
      localStorage.setItem(`visited:${roomId}`, new Date().toISOString())
    }
  }, [roomId])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(false)
      try {
        const [roomRes, histRes, membersRes, seenRes] = await Promise.all([
          getRoom(roomId),
          getHistory(roomId),
          getRoomMembers(roomId),
          getRoomSeen(roomId),
        ])
        if (cancelled) return
        setRoomName(roomRes.data.name)
        setAllMessages(histRes.data)
        if (histRes.data.length > 0) {
          setInitialSeenId(histRes.data[histRes.data.length - 1].id)
        }
        setMembers(membersRes.data)
        const userIdToUsername = {}
        for (const m of membersRes.data) {
          userIdToUsername[String(m.user_id)] = m.username
        }
        const initialSeen = {}
        for (const [userId, messageId] of Object.entries(seenRes.data)) {
          const uname = userIdToUsername[String(userId)]
          if (uname) initialSeen[uname] = messageId
        }
        setSeenMap(initialSeen)
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [roomId])

  useEffect(() => {
    if (messages.length === 0) return
    const last = messages[messages.length - 1]
    setAllMessages(prev => {
      if (prev.find(m => m.id === last.id)) return prev
      return [...prev, last]
    })
  }, [messages])

  const ownTyping = typingUsers.filter(u => u.username !== username)

  if (loading) return (
    <div className="flex flex-col h-screen bg-white dark:bg-zinc-950 items-center justify-center">
      <div className="flex gap-1.5">
        {[0,1,2].map(i => (
          <span key={i} className="w-2 h-2 rounded-full bg-zinc-300 dark:bg-zinc-700 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    </div>
  )

  if (error) return (
    <div className="flex flex-col h-screen bg-white dark:bg-zinc-950 items-center justify-center gap-3">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">Failed to load room.</p>
      <button
        onClick={() => navigate('/rooms')}
        className="text-sm text-zinc-900 dark:text-white underline underline-offset-2"
      >
        Go back
      </button>
    </div>
  )

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-zinc-950">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
        <button
          onClick={() => navigate('/rooms')}
          className="p-1.5 rounded-lg text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
        >
          <BackIcon />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{roomName || '…'}</h1>
          <PresenceBadge members={members} />
        </div>
        <ThemeToggle className="text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800" />
      </header>

      <MessageList
        messages={allMessages}
        seenMap={seenMap}
        onVisible={(id) => sendSeen(id)}
        onEdit={handleEdit}
        onDelete={handleDelete}
        editingId={editingId}
        onEditingIdChange={setEditingId}
      />
      <TypingIndicator typingUsers={ownTyping} />
      <MessageInput ref={messageInputRef} onSend={send} onTyping={sendTyping} onEditLast={handleEditLast} />
    </div>
  )
}
