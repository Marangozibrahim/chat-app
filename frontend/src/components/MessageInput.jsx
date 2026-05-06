import { useState } from 'react'

export default function MessageInput({ onSend }) {
  const [text, setText] = useState('')

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function submit() {
    const trimmed = text.trim()
    if (!trimmed) return
    onSend(trimmed)
    setText('')
  }

  return (
    <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message… (Enter to send)"
        style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)' }}
      />
      <button onClick={submit} style={{ padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6 }}>
        Send
      </button>
    </div>
  )
}
