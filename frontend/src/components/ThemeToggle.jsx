import { useTheme } from '../context/ThemeContext'

const MODES = ['system', 'light', 'dark']
const LABELS = { system: '💻', light: '☀️', dark: '🌙' }
const TITLES = { system: 'System', light: 'Light', dark: 'Dark' }

export default function ThemeToggle() {
  const { mode, setMode } = useTheme()

  return (
    <div style={{ display: 'flex', gap: 2, background: 'rgba(0,0,0,0.15)', borderRadius: 6, padding: 2 }}>
      {MODES.map((m) => (
        <button
          key={m}
          title={TITLES[m]}
          onClick={() => setMode(m)}
          style={{
            padding: '4px 8px',
            border: 'none',
            borderRadius: 4,
            fontSize: 14,
            background: mode === m ? 'var(--surface)' : 'transparent',
            color: mode === m ? 'var(--text)' : 'inherit',
            opacity: mode === m ? 1 : 0.6,
            transition: 'all 0.15s',
          }}
        >
          {LABELS[m]}
        </button>
      ))}
    </div>
  )
}
