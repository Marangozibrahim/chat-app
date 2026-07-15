from typing import AsyncGenerator

import redis.asyncio as aioredis
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.session import AsyncSessionLocal

bearer = HTTPBearer()


async def require_admin(x_admin_token: str = Header(default="")):
    # settings.admin_token == "" means it was never configured — refuse
    # everyone rather than defaulting open.
    if not settings.admin_token or x_admin_token != settings.admin_token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

_redis_pool: aioredis.Redis | None = None


def get_redis_pool() -> aioredis.Redis:
    return _redis_pool


async def init_redis():
    global _redis_pool
    _redis_pool = aioredis.from_url(settings.redis_url, decode_responses=True)


async def close_redis():
    if _redis_pool:
        await _redis_pool.aclose()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session


async def get_redis() -> aioredis.Redis:
    return _redis_pool


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
):
    from app.services.auth import decode_token
    from app.models.user import User
    from sqlalchemy import select

    token = credentials.credentials
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user
