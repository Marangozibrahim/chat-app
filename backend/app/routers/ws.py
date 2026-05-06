import json
import uuid

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

import redis.asyncio as aioredis
from app.db.session import AsyncSessionLocal
from app.dependencies import get_redis_pool
from app.services.auth import decode_token
from app.services import message as message_svc
from app.services import presence as presence_svc
from app.ws.manager import manager

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/rooms/{room_id}")
async def websocket_endpoint(ws: WebSocket, room_id: uuid.UUID, token: str = Query(...)):
    user_id = decode_token(token)
    if not user_id:
        await ws.close(code=4001)
        return

    redis: aioredis.Redis = get_redis_pool()
    room_id_str = str(room_id)

    async with AsyncSessionLocal() as db:
        from app.models.user import User
        from sqlalchemy import select
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            await ws.close(code=4001)
            return
        username = user.username

    await ws.accept()
    await manager.connect(ws, room_id_str)
    await presence_svc.set_online(redis, room_id, user_id)

    join_event = json.dumps({"type": "presence", "user_id": str(user_id), "username": username, "event": "joined"})
    await redis.publish(f"pubsub:room:{room_id_str}", join_event)

    try:
        while True:
            raw = await ws.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = data.get("type")

            if msg_type == "ping":
                await presence_svc.refresh_presence(redis, room_id, user_id)
                await ws.send_text(json.dumps({"type": "pong"}))

            elif msg_type == "message":
                body = data.get("body", "").strip()
                if not body:
                    continue
                async with AsyncSessionLocal() as db:
                    msg = await message_svc.persist_message(db, room_id, user_id, body)

                payload = json.dumps({
                    "type": "message",
                    "id": str(msg.id),
                    "room_id": str(msg.room_id),
                    "user_id": str(msg.user_id),
                    "username": username,
                    "body": msg.body,
                    "created_at": msg.created_at.isoformat(),
                })
                await redis.publish(f"pubsub:room:{room_id_str}", payload)

            elif msg_type == "typing":
                typing_payload = json.dumps({
                    "type": "typing",
                    "user_id": str(user_id),
                    "username": username,
                })
                await redis.publish(f"pubsub:room:{room_id_str}", typing_payload)

            elif msg_type == "seen":
                message_id = data.get("message_id", "")
                if message_id:
                    await presence_svc.mark_seen(redis, room_id, user_id, message_id)
                    seen_payload = json.dumps({
                        "type": "seen",
                        "user_id": str(user_id),
                        "username": username,
                        "message_id": message_id,
                    })
                    await redis.publish(f"pubsub:room:{room_id_str}", seen_payload)

    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(ws, room_id_str)
        await presence_svc.set_offline(redis, room_id, user_id)
        leave_event = json.dumps({"type": "presence", "user_id": str(user_id), "username": username, "event": "left"})
        await redis.publish(f"pubsub:room:{room_id_str}", leave_event)
