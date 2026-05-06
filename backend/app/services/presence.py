import time
import uuid

import redis.asyncio as aioredis

STALE_SECONDS = 60


def _hkey(room_id: uuid.UUID) -> str:
    return f"presence:room:{room_id}"


def _zkey(room_id: uuid.UUID) -> str:
    return f"presence:room:{room_id}:zset"


async def set_online(redis: aioredis.Redis, room_id: uuid.UUID, user_id: uuid.UUID):
    now = time.time()
    await redis.hset(_hkey(room_id), str(user_id), now)
    await redis.zadd(_zkey(room_id), {str(user_id): now})


async def set_offline(redis: aioredis.Redis, room_id: uuid.UUID, user_id: uuid.UUID):
    await redis.hdel(_hkey(room_id), str(user_id))
    await redis.zrem(_zkey(room_id), str(user_id))


async def refresh_presence(redis: aioredis.Redis, room_id: uuid.UUID, user_id: uuid.UUID):
    await set_online(redis, room_id, user_id)


def _seen_key(room_id: uuid.UUID) -> str:
    return f"seen:room:{room_id}"


async def mark_seen(redis: aioredis.Redis, room_id: uuid.UUID, user_id: uuid.UUID, message_id: str):
    await redis.hset(_seen_key(room_id), str(user_id), message_id)


async def get_seen(redis: aioredis.Redis, room_id: uuid.UUID) -> dict[str, str]:
    raw = await redis.hgetall(_seen_key(room_id))
    return {k: v for k, v in raw.items()}


async def get_online_user_ids(redis: aioredis.Redis, room_id: uuid.UUID) -> set[str]:
    now = time.time()
    stale_cutoff = now - STALE_SECONDS
    await redis.zremrangebyscore(_zkey(room_id), "-inf", stale_cutoff)
    stale_ids = await redis.hgetall(_hkey(room_id))
    live = {uid for uid, ts in stale_ids.items() if float(ts) > stale_cutoff}
    return live
