import { useEffect, useRef, useState } from 'react'
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

function MessageItem({ m, isMe, seen, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [editBody, setEditBody] = useState(m.body)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  function submitEdit() {
    if (!editBody.trim()) {
      setEditing(false)
      setConfirmDelete(true)
      return
    }
    if (editBody !== m.body) onEdit(m, editBody)
    setEditing(false)
  }

  if (m.deleted) {
    return (
      <div className={`flex flex-col gap-0.5 max-w-[72%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}>
        {!isMe && <span className="text-[11px] text-zinc-400 px-1">{m.username}</span>}
        <div className="px-3 py-2 rounded-2xl text-sm italic text-zinc-400 dark:text-zinc-600 bg-zinc-100 dark:bg-zinc-800">
          Message deleted
        </div>
      </div>
    )
  }

  return (
    <div className={`flex flex-col gap-0.5 max-w-[72%] group ${isMe ? 'self-end items-end' : 'self-start items-start'}`}>
      {!isMe && <span className="text-[11px] text-zinc-400 px-1">{m.username}</span>}

      {editing ? (
        <input
          ref={inputRef}
          value={editBody}
          onChange={e => setEditBody(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') submitEdit()
            if (e.key === 'Escape') setEditing(false)
          }}
          onBlur={submitEdit}
          className="px-3 py-2 rounded-2xl text-sm bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 outline-none min-w-30"
        />
      ) : (
        <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed ${
          isMe
            ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-br-sm'
            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-bl-sm'
        }`}>
          {m.body}
        </div>
      )}

      <div className="flex items-center gap-1.5 px-1">
        <span className="text-[10px] text-zinc-300 dark:text-zinc-600">
          {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          {m.edited_at && <span className="ml-1">(edited)</span>}
        </span>
        {isMe && (
          <span className={seen ? 'text-blue-400' : 'text-zinc-300 dark:text-zinc-600'}>
            <CheckIcon double={seen} />
          </span>
        )}
        {isMe && !editing && !confirmDelete && (
          <span className="hidden group-hover:flex items-center gap-1 ml-1">
            <button
              onClick={() => { setEditBody(m.body); setEditing(true) }}
              className="text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition"
            >
              Edit
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-[10px] text-zinc-400 hover:text-red-500 transition"
            >
              Delete
            </button>
          </span>
        )}
        {isMe && confirmDelete && (
          <span className="flex items-center gap-1 ml-1">
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400">Delete?</span>
            <button
              onClick={() => { onDelete(m.id); setConfirmDelete(false) }}
              className="text-[10px] text-red-500 hover:text-red-600 transition"
            >
              Yes
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition"
            >
              No
            </button>
          </span>
        )}
      </div>
    </div>
  )
}

export default function MessageList({ messages, seenMap = {}, onVisible, onEdit, onDelete }) {
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
          <MessageItem
            key={m.id}
            m={m}
            isMe={isMe}
            seen={seen}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
