import { useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'

function CheckIcon({ double }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline">
      {double ? (
        <>
          <polyline points="1 12 6 17 13 8"/>
          <polyline points="9 12 14 17 21 8"/>
        </>
      ) : (
        <polyline points="5 12 10 17 19 7"/>
      )}
    </svg>
  )
}

export default function MessageList({ messages, seenMap = {}, onVisible }) {
  const bottomRef = useRef(null)
  const { username } = useAuth()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    if (messages.length > 0) {
      const last = messages[messages.length - 1]
      onVisible?.(last.id)
    }
  }, [messages])

  const seenByOthers = new Set(Object.values(seenMap))

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
      {messages.map(m => {
        const isMe = m.username === username
        const seen = isMe && seenByOthers.has(m.id)
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
            <span className="flex items-center gap-1 text-[10px] text-zinc-300 dark:text-zinc-600 px-1">
              {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {isMe && (
                <span className={seen ? 'text-blue-400' : 'text-zinc-300 dark:text-zinc-600'}>
                  <CheckIcon double={seen} />
                </span>
              )}
            </span>
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
