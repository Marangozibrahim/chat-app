import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listRooms, createRoom, joinRoom } from '../api/rooms'
import { useAuth } from '../context/AuthContext'
import ThemeToggle from '../components/ThemeToggle'

function PlusIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  )
}

function getLastVisit(roomId) {
  const raw = localStorage.getItem(`visited:${roomId}`)
  return raw ? new Date(raw) : null
}

function markVisited(roomId) {
  localStorage.setItem(`visited:${roomId}`, new Date().toISOString())
}

function hasUnread(room) {
  if (!room.last_message_at) return false
  const last = getLastVisit(room.id)
  if (!last) return true
  return new Date(room.last_message_at) > last
}

export default function RoomsPage() {
  const [rooms, setRooms] = useState([])
  const [newName, setNewName] = useState('')
  const [error, setError] = useState('')
  const { logout, username } = useAuth()
  const navigate = useNavigate()

  async function load() {
    try { setRooms((await listRooms()).data) }
    catch { setError('Failed to load rooms') }
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [])

  async function handleCreate(e) {
    e.preventDefault()
    if (!newName.trim()) return
    try { await createRoom(newName.trim()); setNewName(''); load() }
    catch (err) { setError(err.response?.data?.detail || 'Create failed') }
  }

  async function handleJoin(room) {
    if (!room.is_member) {
      try { await joinRoom(room.id) } catch {}
    }
    navigate(`/rooms/${room.id}`)
  }

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
        <span className="text-sm font-semibold text-zinc-900 dark:text-white tracking-tight">Chat</span>
        <div className="flex items-center gap-1">
          <ThemeToggle className="text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800" />
          <button
            onClick={logout}
            className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white px-3 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-xl w-full mx-auto px-4 py-8">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Rooms</h2>
          {username && <p className="text-xs text-zinc-400 mt-0.5">Signed in as <span className="text-zinc-600 dark:text-zinc-300">{username}</span></p>}
        </div>

        <form onSubmit={handleCreate} className="flex gap-2 mb-6">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="New room name…"
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100 transition"
          />
          <button
            type="submit"
            className="flex items-center gap-1.5 px-3 py-2 bg-zinc-900 dark:bg-white hover:bg-zinc-700 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 text-sm font-medium rounded-lg transition"
          >
            <PlusIcon /> Create
          </button>
        </form>

        {error && <p className="text-red-500 text-xs mb-4">{error}</p>}

        <div className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800 border border-zinc-100 dark:border-zinc-800 rounded-xl overflow-hidden">
          {rooms.length === 0 && (
            <p className="px-4 py-6 text-sm text-zinc-400 text-center">No rooms yet. Create one above.</p>
          )}
          {rooms.map(r => {
            const unread = hasUnread(r)
            return (
              <div
                key={r.id}
                className="flex items-center justify-between px-4 py-3 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition cursor-pointer group"
                onClick={() => handleJoin(r)}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {unread && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
                  <div className="min-w-0">
                    <p className={`text-sm truncate ${unread ? 'font-semibold text-zinc-900 dark:text-white' : 'font-medium text-zinc-900 dark:text-white'}`}>{r.name}</p>
                    <p className="text-xs text-zinc-400 mt-0.5">{r.member_count} member{r.member_count !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <span className="text-xs text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition shrink-0 ml-2">Join →</span>
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
