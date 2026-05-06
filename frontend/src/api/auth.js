import client from './client'

export const register = (username, email, password) =>
  client.post('/auth/register', { username, email, password })

export const login = (username, password) =>
  client.post('/auth/login', { username, password })
