import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.message import Message


async def persist_message(db: AsyncSession, room_id: uuid.UUID, user_id: uuid.UUID, body: str) -> Message:
    msg = Message(room_id=room_id, user_id=user_id, body=body)
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return msg


async def get_history(
    db: AsyncSession,
    room_id: uuid.UUID,
    before: datetime | None = None,
    limit: int = 50,
) -> list[dict]:
    q = (
        select(Message)
        .options(joinedload(Message.user))
        .where(Message.room_id == room_id)
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    if before:
        q = q.where(Message.created_at < before)

    result = await db.execute(q)
    messages = result.scalars().all()
    return [
        {
            "id": m.id,
            "room_id": m.room_id,
            "user_id": m.user_id,
            "username": m.user.username if m.user else None,
            "body": m.body,
            "created_at": m.created_at,
        }
        for m in reversed(messages)
    ]


async def edit_message(
    db: AsyncSession, message_id: uuid.UUID, user_id: uuid.UUID, body: str
) -> Message | None:
    msg = await db.get(Message, message_id)
    if not msg or msg.user_id != user_id or msg.deleted:
        return None
    msg.body = body
    msg.edited_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(msg)
    return msg


async def delete_message(
    db: AsyncSession, message_id: uuid.UUID, user_id: uuid.UUID
) -> Message | None:
    msg = await db.get(Message, message_id)
    if not msg or msg.user_id != user_id or msg.deleted:
        return None
    msg.deleted = True
    msg.body = ""
    await db.commit()
    await db.refresh(msg)
    return msg
