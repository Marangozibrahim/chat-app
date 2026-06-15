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
      loginUser(res.data.access_token, username, res.data.refresh_token)
      navigate('/rooms')
    } catch {
      setError('Invalid credentials')
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 flex flex-col">
      <div className="flex justify-end p-4">
        <ThemeToggle className="text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800" />
      </div>
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white mb-1">Welcome back</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-8">Sign in to your account</p>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Username"
              required
              className="w-full px-3 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder-zinc-400 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100 transition"
            />
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              required
              className="w-full px-3 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder-zinc-400 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100 transition"
            />
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <button
              type="submit"
              className="mt-1 w-full py-2.5 bg-zinc-900 dark:bg-white hover:bg-zinc-700 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 text-sm font-medium rounded-lg transition"
            >
              Sign in
            </button>
          </form>
          <p className="mt-6 text-xs text-zinc-500 dark:text-zinc-400">
            No account?{' '}
            <Link to="/register" className="text-zinc-900 dark:text-white font-medium hover:underline">Create one</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
