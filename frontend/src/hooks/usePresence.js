import { useState } from 'react'

export function usePresence(initialMembers = []) {
  const [members, setMembers] = useState(initialMembers)

  function handlePresenceEvent(event) {
    if (event.event === 'joined') {
      setMembers((prev) => {
        const exists = prev.find((m) => m.user_id === event.user_id)
        if (exists) return prev.map((m) => m.user_id === event.user_id ? { ...m, online: true } : m)
        return [...prev, { user_id: event.user_id, username: event.username, online: true }]
      })
    } else if (event.event === 'left') {
      setMembers((prev) => prev.map((m) => m.user_id === event.user_id ? { ...m, online: false } : m))
    }
  }

  return { members, setMembers, handlePresenceEvent }
}
