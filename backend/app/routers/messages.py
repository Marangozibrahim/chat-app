import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

import redis.asyncio as aioredis
from app.dependencies import get_current_user, get_db, get_redis
from app.models.user import User
from app.schemas.message import MessageOut
from app.services import message as message_svc

router = APIRouter(prefix="/rooms", tags=["messages"])


class MessageEdit(BaseModel):
    body: str


@router.get("/{room_id}/messages", response_model=list[MessageOut])
async def get_messages(
    room_id: uuid.UUID,
    before: datetime | None = Query(default=None),
    limit: int = Query(default=50, le=100),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return await message_svc.get_history(db, room_id, before, limit)


@router.patch("/{room_id}/messages/{message_id}", response_model=MessageOut)
async def edit_message(
    room_id: uuid.UUID,
    message_id: uuid.UUID,
    body: MessageEdit,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    current_user: User = Depends(get_current_user),
):
    if not body.body.strip():
        raise HTTPException(status_code=422, detail="Body cannot be empty")
    msg = await message_svc.edit_message(db, message_id, current_user.id, body.body.strip())
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found or not yours")
    payload = json.dumps({
        "type": "message_edited",
        "id": str(msg.id),
        "body": msg.body,
        "edited_at": msg.edited_at.isoformat(),
    })
    await redis.publish(f"pubsub:room:{room_id}", payload)
    return {"id": msg.id, "room_id": msg.room_id, "user_id": msg.user_id,
            "username": current_user.username, "body": msg.body,
            "created_at": msg.created_at, "edited_at": msg.edited_at, "deleted": msg.deleted}


@router.delete("/{room_id}/messages/{message_id}", status_code=204)
async def delete_message(
    room_id: uuid.UUID,
    message_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    current_user: User = Depends(get_current_user),
):
    msg = await message_svc.delete_message(db, message_id, current_user.id)
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found or not yours")
    payload = json.dumps({
        "type": "message_deleted",
        "id": str(msg.id),
    })
    await redis.publish(f"pubsub:room:{room_id}", payload)
