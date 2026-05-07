import { useEffect, useRef, useState } from 'react'

export function useChatSocket(roomId, token, onPresence, onSeen, onEdit, onDelete, initialSeenId) {
  const [messages, setMessages] = useState([])
  const [typingUsers, setTypingUsers] = useState([])
  const [reconnecting, setReconnecting] = useState(false)
  const wsRef = useRef(null)
  const typingTimers = useRef({})
  const initialSeenIdRef = useRef(initialSeenId)
  const initialSeenSentRef = useRef(false)
  const backoffRef = useRef(1000)
  const reconnectTimer = useRef(null)
  const unmountedRef = useRef(false)

  useEffect(() => {
    initialSeenIdRef.current = initialSeenId
    if (initialSeenId && !initialSeenSentRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
      initialSeenSentRef.current = true
      wsRef.current.send(JSON.stringify({ type: 'seen', message_id: initialSeenId }))
    }
  }, [initialSeenId])

  useEffect(() => {
    if (!roomId || !token) return
    unmountedRef.current = false

    function connect() {
      if (unmountedRef.current) return
      const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/rooms/${roomId}?token=${token}`
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        if (unmountedRef.current) return
        backoffRef.current = 1000
        setReconnecting(false)
        if (initialSeenIdRef.current && !initialSeenSentRef.current) {
          initialSeenSentRef.current = true
          ws.send(JSON.stringify({ type: 'seen', message_id: initialSeenIdRef.current }))
        }
      }

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

      ws.onclose = (e) => {
        if (unmountedRef.current) return
        // 4001 = auth failure, no point retrying
        if (e.code === 4001) return
        setReconnecting(true)
        const delay = backoffRef.current
        backoffRef.current = Math.min(backoffRef.current * 2, 30000)
        reconnectTimer.current = setTimeout(connect, delay)
      }
    }

    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }))
      }
    }, 30000)

    connect()

    return () => {
      unmountedRef.current = true
      clearInterval(pingInterval)
      clearTimeout(reconnectTimer.current)
      Object.values(typingTimers.current).forEach(clearTimeout)
      wsRef.current?.close()
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

  return { messages, typingUsers, reconnecting, send, sendTyping, sendSeen, clearMessages }
}
