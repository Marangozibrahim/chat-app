import uuid
from datetime import datetime

from pydantic import BaseModel


class RoomCreate(BaseModel):
    name: str


class RoomOut(BaseModel):
    id: uuid.UUID
    name: str
    created_by: uuid.UUID | None
    created_at: datetime
    member_count: int = 0

    model_config = {"from_attributes": True}


class MemberOut(BaseModel):
    user_id: uuid.UUID
    username: str
    online: bool

    model_config = {"from_attributes": True}
