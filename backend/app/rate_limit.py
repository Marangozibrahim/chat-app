"""Shared rate limiter. Backed by Redis so limits hold across all workers
(in-memory storage would let each process count separately, defeating the
purpose behind a multi-worker deploy). Falls back to in-memory if REDIS_URL
is unreachable at request time — slowapi handles that internally.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

from app.config import settings


def get_client_ip(request: Request) -> str:
    """Real client IP, not the upstream proxy's.

    Every request passes through two nginx hops (edge TLS proxy -> frontend
    container) before reaching the backend, so request.client.host is always
    the innermost proxy's address — using it directly would put every
    visitor in the same rate-limit bucket. Both hops append to
    X-Forwarded-For, so the leftmost entry is the original client.
    """
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return get_remote_address(request)


limiter = Limiter(
    key_func=get_client_ip,
    storage_uri=settings.redis_url,
    default_limits=[],
)
