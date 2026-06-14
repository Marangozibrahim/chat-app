"""Proves the horizontal-scaling mechanism: a message PUBLISHed to a room's
Redis channel is fanned out, via the background listener, to every WebSocket a
worker holds locally — without that worker ever being the one that sent it.
"""
import asyncio
import json
import uuid

import pytest_asyncio

import redis.asyncio as aioredis
from app.config import settings
from app.ws.manager import ConnectionManager
from app.ws.redis_listener import listen


class FakeWebSocket:
    """Stands in for a connected client socket; records what it receives."""

    def __init__(self):
        self.received: list[str] = []

    async def send_text(self, data: str):
        self.received.append(data)


@pytest_asyncio.fixture
async def listener():
    """Run the real Redis pub/sub listener against a fresh manager."""
    manager = ConnectionManager()
    redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    await redis.flushdb()
    task = asyncio.create_task(listen(manager))
    await asyncio.sleep(0.2)  # let psubscribe settle
    yield manager, redis
    task.cancel()
    await redis.flushdb()
    await redis.aclose()


async def _wait_for(ws: FakeWebSocket, count: int = 1, timeout: float = 2.0):
    deadline = asyncio.get_event_loop().time() + timeout
    while len(ws.received) < count and asyncio.get_event_loop().time() < deadline:
        await asyncio.sleep(0.02)


async def test_published_message_reaches_local_socket(listener):
    manager, redis = listener
    room_id = str(uuid.uuid4())
    ws = FakeWebSocket()
    await manager.connect(ws, room_id)

    payload = json.dumps({"type": "message", "body": "hello"})
    await redis.publish(f"pubsub:room:{room_id}", payload)

    await _wait_for(ws, 1)
    assert ws.received == [payload]


async def test_fan_out_to_all_sockets_in_room(listener):
    manager, redis = listener
    room_id = str(uuid.uuid4())
    sockets = [FakeWebSocket() for _ in range(3)]
    for ws in sockets:
        await manager.connect(ws, room_id)

    payload = json.dumps({"type": "message", "body": "broadcast"})
    await redis.publish(f"pubsub:room:{room_id}", payload)

    for ws in sockets:
        await _wait_for(ws, 1)
        assert ws.received == [payload]


async def test_message_isolated_to_its_room(listener):
    manager, redis = listener
    room_a, room_b = str(uuid.uuid4()), str(uuid.uuid4())
    ws_a, ws_b = FakeWebSocket(), FakeWebSocket()
    await manager.connect(ws_a, room_a)
    await manager.connect(ws_b, room_b)

    await redis.publish(f"pubsub:room:{room_a}", "for-a")

    await _wait_for(ws_a, 1)
    assert ws_a.received == ["for-a"]
    assert ws_b.received == []  # room B must not see room A's traffic
