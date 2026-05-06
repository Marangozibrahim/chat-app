import { createContext, useContext, useState } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('token'))
  const [username, setUsername] = useState(() => localStorage.getItem('username'))

  function loginUser(token, username) {
    localStorage.setItem('token', token)
    localStorage.setItem('username', username)
    setToken(token)
    setUsername(username)
  }

  function logout() {
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    setToken(null)
    setUsername(null)
  }

  return (
    <AuthContext.Provider value={{ token, username, loginUser, logout, isAuth: !!token }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
