import { useEffect, useRef } from 'react'

export default function MessageList({ messages }) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 bg-gray-100 dark:bg-gray-900">
      {messages.map(m => (
        <div key={m.id} className="bg-white dark:bg-gray-800 px-3 py-2 rounded-xl max-w-[70%] shadow-sm">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">{m.username}</p>
          <p className="text-gray-900 dark:text-white wrap-break-word mt-0.5">{m.body}</p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">{new Date(m.created_at).toLocaleTimeString()}</p>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
