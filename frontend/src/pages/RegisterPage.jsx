import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { register } from '../api/auth'
import { useAuth } from '../context/AuthContext'

export default function RegisterPage() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const { loginUser } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    try {
      const res = await register(username, email, password)
      loginUser(res.data.access_token, username)
      navigate('/rooms')
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed')
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: '80px auto', padding: 24, background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
      <h2 style={{ marginBottom: 20 }}>Register</h2>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" required style={{ padding: 8, border: '1px solid #ccc', borderRadius: 4 }} />
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required style={{ padding: 8, border: '1px solid #ccc', borderRadius: 4 }} />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required style={{ padding: 8, border: '1px solid #ccc', borderRadius: 4 }} />
        {error && <p style={{ color: 'red', fontSize: 13 }}>{error}</p>}
        <button type="submit" style={{ padding: 10, background: '#0066cc', color: '#fff', border: 'none', borderRadius: 4 }}>Register</button>
      </form>
      <p style={{ marginTop: 16, fontSize: 13 }}>Have an account? <Link to="/login">Login</Link></p>
    </div>
  )
}
