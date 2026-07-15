import { useEffect, useState } from 'react'
import { getWorkers } from '../api/admin'
import ThemeToggle from '../components/ThemeToggle'

function secondsAgo(unixSeconds) {
  return Math.max(0, Math.round(Date.now() / 1000 - unixSeconds))
}

function uptime(startedAt) {
  const s = secondsAgo(startedAt)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

export default function AdminPage() {
  const [token, setToken] = useState(() => sessionStorage.getItem('admin_token') || '')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    sessionStorage.setItem('admin_token', token)

    let cancelled = false
    async function load() {
      try {
        const res = await getWorkers(token)
        if (!cancelled) { setData(res.data); setError('') }
      } catch (err) {
        if (cancelled) return
        setData(null)
        setError(err.response?.status === 403 ? 'Invalid admin token' : 'Failed to load workers')
      }
    }
    load()
    const interval = setInterval(load, 5000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [token])

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
        <span className="text-sm font-semibold text-zinc-900 dark:text-white tracking-tight">Worker Dashboard</span>
        <div className="flex items-center gap-1">
          <a
            href="http://localhost:8089"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white px-3 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            title="Only reachable when docker-compose.loadtest.yml's locust-master service is running"
          >
            Load Test (Locust) →
          </a>
          <ThemeToggle className="text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800" />
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8">
        <input
          type="password"
          value={token}
          onChange={e => setToken(e.target.value)}
          placeholder="Admin token…"
          className="w-full px-3 py-2 mb-6 text-sm rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100 transition"
        />

        {error && <p className="text-red-500 text-xs mb-4">{error}</p>}

        {data && (
          <>
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="border border-zinc-100 dark:border-zinc-800 rounded-xl px-4 py-3">
                <p className="text-xs text-zinc-400">Workers</p>
                <p className="text-xl font-semibold text-zinc-900 dark:text-white">{data.worker_count}</p>
              </div>
              <div className="border border-zinc-100 dark:border-zinc-800 rounded-xl px-4 py-3">
                <p className="text-xs text-zinc-400">Connections</p>
                <p className="text-xl font-semibold text-zinc-900 dark:text-white">{data.total_connections}</p>
              </div>
              <div className="border border-zinc-100 dark:border-zinc-800 rounded-xl px-4 py-3">
                <p className="text-xs text-zinc-400">Active rooms</p>
                <p className="text-xl font-semibold text-zinc-900 dark:text-white">{data.active_rooms}</p>
              </div>
            </div>

            <div className="border border-zinc-100 dark:border-zinc-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-zinc-50 dark:bg-zinc-900 text-left text-xs text-zinc-400">
                    <th className="px-4 py-2 font-medium">Worker</th>
                    <th className="px-4 py-2 font-medium">Uptime</th>
                    <th className="px-4 py-2 font-medium">Last heartbeat</th>
                    <th className="px-4 py-2 font-medium">Connections</th>
                    <th className="px-4 py-2 font-medium">Rooms</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {data.workers.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-zinc-400">No live workers</td></tr>
                  )}
                  {data.workers.map(w => (
                    <tr key={w.worker_id} className="text-zinc-900 dark:text-white">
                      <td className="px-4 py-2 font-mono text-xs">{w.hostname}:{w.pid}</td>
                      <td className="px-4 py-2">{uptime(w.started_at)}</td>
                      <td className="px-4 py-2 text-zinc-400">{secondsAgo(w.last_heartbeat)}s ago</td>
                      <td className="px-4 py-2">{w.conn_count}</td>
                      <td className="px-4 py-2">{w.room_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
