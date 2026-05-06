import client from './client'

export const listRooms = () => client.get('/rooms')
export const createRoom = (name) => client.post('/rooms', { name })
export const joinRoom = (roomId) => client.post(`/rooms/${roomId}/join`)
export const leaveRoom = (roomId) => client.delete(`/rooms/${roomId}/leave`)
export const getRoomMembers = (roomId) => client.get(`/rooms/${roomId}/members`)
