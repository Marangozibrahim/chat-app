import { useEffect, useRef, useState } from 'react'

export function useChatSocket(roomId, token, onPresence) {
  const [messages, setMessages] = useState([])
  const wsRef = useRef(null)

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
      }
    }

    return () => {
      clearInterval(pingInterval)
      ws.close()
    }
  }, [roomId, token])

  function send(body) {
    wsRef.current?.send(JSON.stringify({ type: 'message', body }))
  }

  function clearMessages() {
    setMessages([])
  }

  return { messages, send, clearMessages }
}
