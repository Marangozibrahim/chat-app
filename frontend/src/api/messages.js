import client from './client'

export const getHistory = (roomId, before = null, limit = 50) => {
  const params = { limit }
  if (before) params.before = before
  return client.get(`/rooms/${roomId}/messages`, { params })
}
