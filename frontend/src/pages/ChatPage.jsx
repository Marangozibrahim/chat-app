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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: '#0066cc', color: '#fff' }}>
        <button onClick={() => navigate('/rooms')} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer' }}>←</button>
        <strong>Room</strong>
      </div>
      <PresenceBadge members={members} />
      <MessageList messages={allMessages} />
      <MessageInput onSend={send} />
    </div>
  )
}
