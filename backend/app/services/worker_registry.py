import asyncio
import json
import logging
import os
import socket
import time
import uuid

import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

STALE_SECONDS = 30
HEARTBEAT_INTERVAL = 10

_HKEY = "workers:heartbeat"
_ZKEY = "workers:heartbeat:zset"


def make_worker_id() -> str:
    return f"{socket.gethostname()}:{os.getpid()}:{uuid.uuid4().hex[:8]}"


async def heartbeat(redis: aioredis.Redis, worker_id: str, started_at: float, conn_count: int, room_ids: list[str]):
    now = time.time()
    payload = json.dumps(
        {
            "worker_id": worker_id,
            "hostname": socket.gethostname(),
            "pid": os.getpid(),
            "started_at": started_at,
            "last_heartbeat": now,
            "conn_count": conn_count,
            "room_count": len(room_ids),
            "room_ids": room_ids,
        }
    )
    await redis.hset(_HKEY, worker_id, payload)
    await redis.zadd(_ZKEY, {worker_id: now})


async def deregister(redis: aioredis.Redis, worker_id: str):
    await redis.hdel(_HKEY, worker_id)
    await redis.zrem(_ZKEY, worker_id)


async def get_live_workers(redis: aioredis.Redis) -> list[dict]:
    now = time.time()
    stale_cutoff = now - STALE_SECONDS
    await redis.zremrangebyscore(_ZKEY, "-inf", stale_cutoff)
    live_ids = await redis.zrange(_ZKEY, 0, -1)
    if not live_ids:
        return []
    raw = await redis.hmget(_HKEY, live_ids)
    workers = [json.loads(r) for r in raw if r]
    workers.sort(key=lambda w: w["worker_id"])
    return workers


async def heartbeat_loop(redis: aioredis.Redis, manager):
    """Report this process's identity + local connection stats to Redis every
    HEARTBEAT_INTERVAL seconds, so /admin/workers can see it. Mirrors the
    cleanup style of ws/redis_listener.py: a graceful cancel deregisters
    immediately rather than waiting out STALE_SECONDS.
    """
    worker_id = make_worker_id()
    started_at = time.time()
    logger.info("Worker heartbeat started: %s", worker_id)
    try:
        while True:
            conn_count, room_ids = manager.local_stats()
            await heartbeat(redis, worker_id, started_at, conn_count, room_ids)
            await asyncio.sleep(HEARTBEAT_INTERVAL)
    except asyncio.CancelledError:
        pass
    finally:
        # main.py's lifespan doesn't await this task before closing the
        # shared Redis pool (matching redis_listener.py's fire-and-forget
        # cancel — awaiting it there was tried and broke TestClient's
        # lifespan teardown), so this can race a pool already mid-close.
        # Best-effort: a missed deregister just falls back to STALE_SECONDS.
        try:
            await deregister(redis, worker_id)
        except Exception:
            pass
        logger.info("Worker heartbeat stopped: %s", worker_id)
