import { useEffect, useRef, useState } from 'react'

export function useChatSocket(roomId, token, onPresence, onSeen) {
  const [messages, setMessages] = useState([])
  const [typingUsers, setTypingUsers] = useState([])
  const wsRef = useRef(null)
  const typingTimers = useRef({})

  useEffect(() => {
    if (!roomId || !token) return

    const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/rooms/${roomId}?token=${token}`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }))
    }, 30000)


    ws.onmessage = (e) => {
      const data = JSON.parse(e.data)
      if (data.type === 'message') {
        setMessages((prev) => [...prev, data])
      } else if (data.type === 'presence') {
        onPresence?.(data)
      } else if (data.type === 'typing') {
        const { user_id, username } = data
        setTypingUsers((prev) => {
          if (prev.find(u => u.user_id === user_id)) return prev
          return [...prev, { user_id, username }]
        })
        clearTimeout(typingTimers.current[user_id])
        typingTimers.current[user_id] = setTimeout(() => {
          setTypingUsers((prev) => prev.filter(u => u.user_id !== user_id))
        }, 3000)
      } else if (data.type === 'seen') {
        onSeen?.(data)
      }
    }

    return () => {
      clearInterval(pingInterval)
      Object.values(typingTimers.current).forEach(clearTimeout)
      ws.close()
    }
  }, [roomId, token])

  function safeSend(data) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }

  function send(body) {
    safeSend({ type: 'message', body })
  }

  function sendTyping() {
    safeSend({ type: 'typing' })
  }

  function sendSeen(messageId) {
    safeSend({ type: 'seen', message_id: messageId })
  }

  function clearMessages() {
    setMessages([])
  }

  return { messages, typingUsers, send, sendTyping, sendSeen, clearMessages }
}
