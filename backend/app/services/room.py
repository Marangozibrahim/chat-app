import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.message import Message
from app.models.room import Room
from app.models.room_member import RoomMember


async def list_rooms(db: AsyncSession) -> list[dict]:
    result = await db.execute(
        select(
            Room,
            func.count(RoomMember.user_id).label("member_count"),
            func.max(Message.created_at).label("last_message_at"),
        )
        .outerjoin(RoomMember, RoomMember.room_id == Room.id)
        .outerjoin(Message, Message.room_id == Room.id)
        .group_by(Room.id)
        .order_by(Room.created_at.desc())
    )
    rows = result.all()
    return [
        {
            "id": r.Room.id,
            "name": r.Room.name,
            "created_by": r.Room.created_by,
            "created_at": r.Room.created_at,
            "member_count": r.member_count,
            "last_message_at": r.last_message_at,
        }
        for r in rows
    ]


async def get_room(db: AsyncSession, room_id: uuid.UUID) -> dict | None:
    result = await db.execute(
        select(Room, func.count(RoomMember.user_id).label("member_count"))
        .outerjoin(RoomMember, RoomMember.room_id == Room.id)
        .where(Room.id == room_id)
        .group_by(Room.id)
    )
    row = result.one_or_none()
    if not row:
        return None
    return {
        "id": row.Room.id,
        "name": row.Room.name,
        "created_by": row.Room.created_by,
        "created_at": row.Room.created_at,
        "member_count": row.member_count,
    }


async def create_room(db: AsyncSession, name: str, user_id: uuid.UUID) -> Room:
    room = Room(name=name, created_by=user_id)
    db.add(room)
    await db.commit()
    await db.refresh(room)
    return room


async def join_room(db: AsyncSession, room_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    existing = await db.get(RoomMember, (room_id, user_id))
    if existing:
        return False
    member = RoomMember(room_id=room_id, user_id=user_id)
    db.add(member)
    await db.commit()
    return True


async def leave_room(db: AsyncSession, room_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    member = await db.get(RoomMember, (room_id, user_id))
    if not member:
        return False
    await db.delete(member)
    await db.commit()
    return True


async def get_room_members(db: AsyncSession, room_id: uuid.UUID) -> list[dict]:
    from app.models.user import User
    result = await db.execute(
        select(User).join(RoomMember, RoomMember.user_id == User.id).where(RoomMember.room_id == room_id)
    )
    users = result.scalars().all()
    return [{"user_id": u.id, "username": u.username} for u in users]
