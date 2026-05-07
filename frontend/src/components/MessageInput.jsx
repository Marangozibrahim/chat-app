import { useRef, useState } from 'react'

function SendIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  )
}

export default function MessageInput({ onSend, onTyping, onEditLast }) {
  const [text, setText] = useState('')
  const typingTimer = useRef(null)

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
    if (e.key === 'ArrowUp' && !text) { e.preventDefault(); onEditLast?.() }
  }

  function handleChange(e) {
    setText(e.target.value)
    if (!typingTimer.current) {
      onTyping?.()
    }
    clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(() => { typingTimer.current = null }, 2000)
  }

  function submit() {
    const trimmed = text.trim()
    if (!trimmed) return
    onSend(trimmed)
    setText('')
    clearTimeout(typingTimer.current)
    typingTimer.current = null
  }

  return (
    <div className="px-4 py-3 border-t border-zinc-100 dark:border-zinc-800 shrink-0">
      <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2">
        <input
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Message…"
          className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none"
        />
        <button
          onClick={submit}
          disabled={!text.trim()}
          className="p-1.5 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          <SendIcon />
        </button>
      </div>
    </div>
  )
}
