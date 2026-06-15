"""Shared rate limiter. Backed by Redis so limits hold across all workers
(in-memory storage would let each process count separately, defeating the
purpose behind a multi-worker deploy). Falls back to in-memory if REDIS_URL
is unreachable at request time — slowapi handles that internally.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=settings.redis_url,
    default_limits=[],
)
