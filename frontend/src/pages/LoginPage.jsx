import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { login } from '../api/auth'
import { useAuth } from '../context/AuthContext'
import ThemeToggle from '../components/ThemeToggle'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const { loginUser } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    try {
      const res = await login(username, password)
      loginUser(res.data.access_token, username)
      navigate('/rooms')
    } catch {
      setError('Invalid credentials')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', top: 16, right: 16 }}><ThemeToggle /></div>
      <div style={{ maxWidth: 360, width: '100%', padding: 24, background: 'var(--surface)', borderRadius: 8, boxShadow: `0 2px 8px var(--shadow)` }}>
        <h2 style={{ marginBottom: 20, color: 'var(--text)' }}>Sign In</h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" required style={{ padding: 8, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', color: 'var(--text)' }} />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required style={{ padding: 8, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', color: 'var(--text)' }} />
          {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
          <button type="submit" style={{ padding: 10, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4 }}>Login</button>
        </form>
        <p style={{ marginTop: 16, fontSize: 13, color: 'var(--text-muted)' }}>No account? <Link to="/register" style={{ color: 'var(--accent)' }}>Register</Link></p>
      </div>
    </div>
  )
}
