import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => localStorage.getItem('theme') ?? 'system')

  useEffect(() => {
    const root = document.documentElement
    const mq = window.matchMedia('(prefers-color-scheme: dark)')

    function apply(m) {
      const dark = m === 'dark' || (m === 'system' && mq.matches)
      root.setAttribute('data-theme', dark ? 'dark' : 'light')
    }

    apply(mode)
    localStorage.setItem('theme', mode)

    if (mode === 'system') {
      const handler = () => apply('system')
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [mode])

  return <ThemeContext.Provider value={{ mode, setMode }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
