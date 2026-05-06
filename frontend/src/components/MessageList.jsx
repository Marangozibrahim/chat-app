import { useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'

export default function MessageList({ messages }) {
  const bottomRef = useRef(null)
  const { username } = useAuth()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
      {messages.map(m => {
        const isMe = m.username === username
        return (
          <div key={m.id} className={`flex flex-col gap-0.5 max-w-[72%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}>
            {!isMe && (
              <span className="text-[11px] text-zinc-400 px-1">{m.username}</span>
            )}
            <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed ${
              isMe
                ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-br-sm'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-bl-sm'
            }`}>
              {m.body}
            </div>
            <span className="text-[10px] text-zinc-300 dark:text-zinc-600 px-1">
              {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
