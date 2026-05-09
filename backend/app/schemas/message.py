import uuid
from datetime import datetime

from pydantic import BaseModel


class MessageOut(BaseModel):
    id: uuid.UUID
    room_id: uuid.UUID
    user_id: uuid.UUID | None
    username: str | None
    body: str
    created_at: datetime
    edited_at: datetime | None = None
    deleted: bool = False
    attachment_url: str | None = None

    model_config = {"from_attributes": True}
