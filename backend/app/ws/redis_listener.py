import asyncio
import logging

import redis.asyncio as aioredis

from app.config import settings

logger = logging.getLogger(__name__)


async def listen(manager):
    """Subscribe to all room pub/sub channels and fan out to local WebSocket connections."""
    redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    pubsub = redis.pubsub()
    await pubsub.psubscribe("pubsub:room:*")
    logger.info("Redis pub/sub listener started")
    try:
        async for message in pubsub.listen():
            if message["type"] != "pmessage":
                continue
            channel: str = message["channel"]
            # channel format: pubsub:room:<room_id>
            parts = channel.split(":")
            if len(parts) < 3:
                continue
            room_id = parts[2]
            await manager.broadcast_local(room_id, message["data"])
    except asyncio.CancelledError:
        pass
    finally:
        await pubsub.punsubscribe("pubsub:room:*")
        await redis.aclose()
        logger.info("Redis pub/sub listener stopped")
