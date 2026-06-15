import client from './client'

export const register = (username, email, password) =>
  client.post('/auth/register', { username, email, password })

export const login = (username, password) =>
  client.post('/auth/login', { username, password })

// Uses a bare axios call (not `client`) to avoid the auth interceptor's
// refresh loop when the refresh request itself fails.
export const refresh = (refreshToken) =>
  client.post('/auth/refresh', { refresh_token: refreshToken })
