import asyncio
from collections import defaultdict

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self._rooms: dict[str, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket, room_id: str):
        async with self._lock:
            self._rooms[room_id].add(ws)

    async def disconnect(self, ws: WebSocket, room_id: str):
        async with self._lock:
            self._rooms[room_id].discard(ws)

    async def broadcast_local(self, room_id: str, data: str):
        sockets = list(self._rooms.get(room_id, set()))
        if not sockets:
            return
        await asyncio.gather(*[ws.send_text(data) for ws in sockets], return_exceptions=True)


manager = ConnectionManager()
