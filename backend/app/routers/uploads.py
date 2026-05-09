import json
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

import redis.asyncio as aioredis
from app.config import settings
from app.dependencies import get_current_user, get_db, get_redis
from app.models.room_member import RoomMember
from app.models.user import User
from app.services import message as message_svc
from app.services.storage import ALLOWED_MIME, generate_presigned_put

router = APIRouter(prefix="/rooms", tags=["uploads"])


class UploadUrlRequest(BaseModel):
    filename: str
    content_type: str
    size: int


class UploadUrlResponse(BaseModel):
    upload_url: str
    object_key: str
    attachment_url: str


class ConfirmUploadRequest(BaseModel):
    object_key: str
    attachment_url: str
    body: str = ""


@router.post("/{room_id}/upload-url", response_model=UploadUrlResponse)
async def get_upload_url(
    room_id: uuid.UUID,
    req: UploadUrlRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    member = await db.get(RoomMember, (room_id, current_user.id))
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this room")
    if req.content_type not in ALLOWED_MIME:
        raise HTTPException(status_code=415, detail="File type not allowed")
    if req.size > settings.max_upload_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File too large (max {settings.max_upload_bytes // 1_048_576} MB)",
        )
    try:
        upload_url, object_key, attachment_url = generate_presigned_put(
            str(room_id), req.filename, req.content_type
        )
    except Exception:
        raise HTTPException(status_code=500, detail="Could not generate upload URL")
    return UploadUrlResponse(
        upload_url=upload_url,
        object_key=object_key,
        attachment_url=attachment_url,
    )


@router.post("/{room_id}/confirm-upload")
async def confirm_upload(
    room_id: uuid.UUID,
    req: ConfirmUploadRequest,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    current_user: User = Depends(get_current_user),
):
    member = await db.get(RoomMember, (room_id, current_user.id))
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this room")

    msg_dict = await message_svc.persist_message_with_attachment(
        db, room_id, current_user.id, req.body, req.attachment_url
    )

    payload = json.dumps(
        {
            "type": "message",
            "id": str(msg_dict["id"]),
            "room_id": str(msg_dict["room_id"]),
            "user_id": str(msg_dict["user_id"]),
            "username": msg_dict["username"],
            "body": msg_dict["body"],
            "created_at": msg_dict["created_at"].isoformat(),
            "edited_at": None,
            "deleted": False,
            "attachment_url": msg_dict["attachment_url"],
        }
    )
    await redis.publish(f"pubsub:room:{room_id}", payload)
    return msg_dict
