import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class RoomMember(Base):
    __tablename__ = "room_members"

    room_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("rooms.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    room = relationship("Room", back_populates="members")
    user = relationship("User", back_populates="memberships")
