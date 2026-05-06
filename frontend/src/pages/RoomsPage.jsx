import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listRooms, createRoom, joinRoom } from '../api/rooms'
import { useAuth } from '../context/AuthContext'
import ThemeToggle from '../components/ThemeToggle'

export default function RoomsPage() {
  const [rooms, setRooms] = useState([])
  const [newName, setNewName] = useState('')
  const [error, setError] = useState('')
  const { logout } = useAuth()
  const navigate = useNavigate()

  async function load() {
    try {
      const res = await listRooms()
      setRooms(res.data)
    } catch {
      setError('Failed to load rooms')
    }
  }

  useEffect(() => { load() }, [])

  async function handleCreate(e) {
    e.preventDefault()
    if (!newName.trim()) return
    try {
      await createRoom(newName.trim())
      setNewName('')
      load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Create failed')
    }
  }

  async function handleJoin(roomId) {
    try { await joinRoom(roomId) } catch {}
    navigate(`/rooms/${roomId}`)
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">Rooms</h2>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={logout}
              className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-sm rounded-lg transition-colors"
            >
              Logout
            </button>
          </div>
        </div>

        <form onSubmit={handleCreate} className="flex gap-2 mb-6">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="New room name"
            className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
            Create
          </button>
        </form>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <div className="flex flex-col gap-3">
          {rooms.map(r => (
            <div
              key={r.id}
              className="flex items-center justify-between bg-white dark:bg-gray-800 px-4 py-3 rounded-xl shadow-sm"
            >
              <div>
                <span className="font-medium text-gray-900 dark:text-white">{r.name}</span>
                <span className="ml-2 text-xs text-gray-400">{r.member_count} member{r.member_count !== 1 ? 's' : ''}</span>
              </div>
              <button
                onClick={() => handleJoin(r.id)}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
              >
                Join
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
