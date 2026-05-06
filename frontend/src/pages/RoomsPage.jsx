import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listRooms, createRoom, joinRoom } from '../api/rooms'
import { useAuth } from '../context/AuthContext'

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
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <h2>Rooms</h2>
        <button onClick={logout} style={{ padding: '6px 12px', background: '#e55', color: '#fff', border: 'none', borderRadius: 4 }}>Logout</button>
      </div>

      <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New room name"
          style={{ flex: 1, padding: '8px 10px', border: '1px solid #ccc', borderRadius: 4 }}
        />
        <button type="submit" style={{ padding: '8px 16px', background: '#0066cc', color: '#fff', border: 'none', borderRadius: 4 }}>Create</button>
      </form>

      {error && <p style={{ color: 'red', marginBottom: 12 }}>{error}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rooms.map((r) => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', padding: '12px 16px', borderRadius: 6, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <div>
              <strong>{r.name}</strong>
              <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>{r.member_count} member{r.member_count !== 1 ? 's' : ''}</span>
            </div>
            <button onClick={() => handleJoin(r.id)} style={{ padding: '6px 14px', background: '#0066cc', color: '#fff', border: 'none', borderRadius: 4 }}>Join</button>
          </div>
        ))}
      </div>
    </div>
  )
}
