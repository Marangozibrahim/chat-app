import { useEffect, useRef } from 'react'

export default function MessageList({ messages }) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {messages.map((m) => (
        <div key={m.id} style={{ background: '#fff', padding: '6px 10px', borderRadius: 6, maxWidth: '70%' }}>
          <strong style={{ fontSize: 12, color: '#555' }}>{m.username}</strong>
          <p style={{ margin: '2px 0 0', wordBreak: 'break-word' }}>{m.body}</p>
          <span style={{ fontSize: 10, color: '#aaa' }}>{new Date(m.created_at).toLocaleTimeString()}</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
