import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

import redis.asyncio as aioredis
from app.dependencies import get_current_user, get_db, get_redis
from app.models.room import Room
from app.models.user import User
from app.schemas.room import MemberOut, RoomCreate, RoomOut
from app.services import presence as presence_svc
from app.services import room as room_svc

router = APIRouter(prefix="/rooms", tags=["rooms"])


@router.get("", response_model=list[RoomOut])
async def list_rooms(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    return await room_svc.list_rooms(db)


@router.post("", response_model=RoomOut, status_code=201)
async def create_room(body: RoomCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    return await room_svc.create_room(db, body.name, current_user.id)


@router.post("/{room_id}/join", status_code=204)
async def join_room(room_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    room = await db.get(Room, room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    await room_svc.join_room(db, room_id, current_user.id)


@router.delete("/{room_id}/leave", status_code=204)
async def leave_room(room_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    await room_svc.leave_room(db, room_id, current_user.id)


@router.get("/{room_id}/members", response_model=list[MemberOut])
async def get_members(
    room_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    _: User = Depends(get_current_user),
):
    members = await room_svc.get_room_members(db, room_id)
    online_ids = await presence_svc.get_online_user_ids(redis, room_id)
    return [
        MemberOut(user_id=m["user_id"], username=m["username"], online=str(m["user_id"]) in online_ids)
        for m in members
    ]
