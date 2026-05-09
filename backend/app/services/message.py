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


async def persist_message_with_attachment(
    db: AsyncSession,
    room_id: uuid.UUID,
    user_id: uuid.UUID,
    body: str,
    attachment_url: str,
) -> dict:
    msg = Message(room_id=room_id, user_id=user_id, body=body, attachment_url=attachment_url)
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    await db.refresh(msg, ["user"])
    return {
        "id": msg.id,
        "room_id": msg.room_id,
        "user_id": msg.user_id,
        "username": msg.user.username if msg.user else None,
        "body": msg.body,
        "created_at": msg.created_at,
        "edited_at": msg.edited_at,
        "deleted": msg.deleted,
        "attachment_url": msg.attachment_url,
    }


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
            "edited_at": m.edited_at,
            "deleted": m.deleted,
            "attachment_url": m.attachment_url,
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
