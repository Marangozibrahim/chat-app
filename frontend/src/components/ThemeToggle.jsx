import { useTheme } from '../context/ThemeContext'

export default function ThemeToggle() {
  const { dark, toggle } = useTheme()
  return (
    <button
      onClick={toggle}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="p-2 rounded-lg text-xl leading-none hover:bg-white/10 transition-colors"
    >
      {dark ? '☀️' : '🌙'}
    </button>
  )
}
