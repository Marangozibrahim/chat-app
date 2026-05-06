import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getHistory } from '../api/messages'
import { getRoom, getRoomMembers } from '../api/rooms'
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
  const [history, setHistory] = useState([])
  const [roomName, setRoomName] = useState('')
  const [seenMap, setSeenMap] = useState({})

  function handleSeen(data) {
    if (data.username !== username) {
      setSeenMap(prev => ({ ...prev, [data.username]: data.message_id }))
    }
  }

  const { members, setMembers, handlePresenceEvent } = usePresence([])
  const { messages, typingUsers, send, sendTyping, sendSeen } = useChatSocket(roomId, token, handlePresenceEvent, handleSeen)

  useEffect(() => {
    async function load() {
      const [roomRes, histRes, membersRes] = await Promise.all([
        getRoom(roomId),
        getHistory(roomId),
        getRoomMembers(roomId),
      ])
      setRoomName(roomRes.data.name)
      setHistory(histRes.data)
      setMembers(membersRes.data)
    }
    load()
  }, [roomId])

  const allMessages = [...history, ...messages]

  const ownTyping = typingUsers.filter(u => u.username !== username)

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
      />
      <TypingIndicator typingUsers={ownTyping} />
      <MessageInput onSend={send} onTyping={sendTyping} />
    </div>
  )
}
