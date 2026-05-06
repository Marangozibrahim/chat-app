import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getHistory } from '../api/messages'
import { getRoomMembers } from '../api/rooms'
import { useAuth } from '../context/AuthContext'
import { useChatSocket } from '../hooks/useChatSocket'
import { usePresence } from '../hooks/usePresence'
import MessageList from '../components/MessageList'
import MessageInput from '../components/MessageInput'
import PresenceBadge from '../components/PresenceBadge'
import ThemeToggle from '../components/ThemeToggle'

export default function ChatPage() {
  const { roomId } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()
  const [history, setHistory] = useState([])

  const { members, setMembers, handlePresenceEvent } = usePresence([])
  const { messages, send } = useChatSocket(roomId, token, handlePresenceEvent)

  useEffect(() => {
    async function load() {
      const [histRes, membersRes] = await Promise.all([
        getHistory(roomId),
        getRoomMembers(roomId),
      ])
      setHistory(histRes.data)
      setMembers(membersRes.data)
    }
    load()
  }, [roomId])

  const allMessages = [...history, ...messages]

  return (
    <div className="flex flex-col h-screen bg-gray-100 dark:bg-gray-900">
      <div className="flex items-center gap-3 px-4 py-3 bg-blue-600 text-white shrink-0">
        <button onClick={() => navigate('/rooms')} className="text-xl leading-none hover:opacity-75 transition-opacity">←</button>
        <strong className="flex-1">Room</strong>
        <ThemeToggle />
      </div>
      <PresenceBadge members={members} />
      <MessageList messages={allMessages} />
      <MessageInput onSend={send} />
    </div>
  )
}
