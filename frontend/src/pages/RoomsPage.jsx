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
    try {
      await joinRoom(roomId)
      navigate(`/rooms/${roomId}`)
    } catch {
      navigate(`/rooms/${roomId}`)
    }
  }

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ color: 'var(--text)' }}>Rooms</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <ThemeToggle />
          <button onClick={logout} style={{ padding: '6px 12px', background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: 4 }}>Logout</button>
        </div>
      </div>

      <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New room name"
          style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', color: 'var(--text)' }}
        />
        <button type="submit" style={{ padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4 }}>Create</button>
      </form>

      {error && <p style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rooms.map((r) => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface)', padding: '12px 16px', borderRadius: 6, boxShadow: `0 1px 3px var(--shadow)` }}>
            <div>
              <strong style={{ color: 'var(--text)' }}>{r.name}</strong>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>{r.member_count} member{r.member_count !== 1 ? 's' : ''}</span>
            </div>
            <button onClick={() => handleJoin(r.id)} style={{ padding: '6px 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4 }}>Join</button>
          </div>
        ))}
      </div>
    </div>
  )
}
