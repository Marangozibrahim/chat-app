import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.user import User
from app.schemas.message import MessageOut
from app.services import message as message_svc

router = APIRouter(prefix="/rooms", tags=["messages"])


@router.get("/{room_id}/messages", response_model=list[MessageOut])
async def get_messages(
    room_id: uuid.UUID,
    before: datetime | None = Query(default=None),
    limit: int = Query(default=50, le=100),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return await message_svc.get_history(db, room_id, before, limit)
