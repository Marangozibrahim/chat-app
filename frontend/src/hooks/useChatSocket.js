import { useEffect, useRef, useState } from 'react'

export function useChatSocket(roomId, token, onPresence, onSeen, onEdit, onDelete, initialSeenId) {
  const [messages, setMessages] = useState([])
  const [typingUsers, setTypingUsers] = useState([])
  const wsRef = useRef(null)
  const typingTimers = useRef({})
  const initialSeenIdRef = useRef(initialSeenId)
  const initialSeenSentRef = useRef(false)

  useEffect(() => {
    initialSeenIdRef.current = initialSeenId
    if (initialSeenId && !initialSeenSentRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
      initialSeenSentRef.current = true
      wsRef.current.send(JSON.stringify({ type: 'seen', message_id: initialSeenId }))
    }
  }, [initialSeenId])

  useEffect(() => {
    if (!roomId || !token) return

    const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/rooms/${roomId}?token=${token}`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      if (initialSeenIdRef.current && !initialSeenSentRef.current) {
        initialSeenSentRef.current = true
        ws.send(JSON.stringify({ type: 'seen', message_id: initialSeenIdRef.current }))
      }
    }

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
      } else if (data.type === 'message_edited') {
        onEdit?.(data.id, data.body, data.edited_at)
      } else if (data.type === 'message_deleted') {
        onDelete?.(data.id)
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
