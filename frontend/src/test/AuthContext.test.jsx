import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { AuthProvider, useAuth } from '../context/AuthContext'

const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>

beforeEach(() => localStorage.clear())

describe('AuthContext', () => {
  it('starts unauthenticated with no token', () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    expect(result.current.isAuth).toBe(false)
    expect(result.current.token).toBeNull()
  })

  it('loginUser persists access, username, and refresh token', () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    act(() => result.current.loginUser('acc', 'neo', 'ref'))

    expect(result.current.isAuth).toBe(true)
    expect(result.current.token).toBe('acc')
    expect(result.current.username).toBe('neo')
    expect(localStorage.getItem('token')).toBe('acc')
    expect(localStorage.getItem('username')).toBe('neo')
    expect(localStorage.getItem('refresh_token')).toBe('ref')
  })

  it('logout clears all auth storage', () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    act(() => result.current.loginUser('acc', 'neo', 'ref'))
    act(() => result.current.logout())

    expect(result.current.isAuth).toBe(false)
    expect(result.current.token).toBeNull()
    expect(localStorage.getItem('token')).toBeNull()
    expect(localStorage.getItem('refresh_token')).toBeNull()
  })

  it('hydrates token from localStorage on mount', () => {
    localStorage.setItem('token', 'existing')
    localStorage.setItem('username', 'trinity')
    const { result } = renderHook(() => useAuth(), { wrapper })
    expect(result.current.isAuth).toBe(true)
    expect(result.current.username).toBe('trinity')
  })
})
