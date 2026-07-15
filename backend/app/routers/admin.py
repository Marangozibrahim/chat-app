from fastapi import APIRouter, Depends

import redis.asyncio as aioredis
from app.dependencies import get_redis, require_admin
from app.services import worker_registry

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/workers", dependencies=[Depends(require_admin)])
async def list_workers(redis: aioredis.Redis = Depends(get_redis)):
    workers = await worker_registry.get_live_workers(redis)
    # A room's connections can be spread across multiple workers, so summing
    # each worker's local room_count would double-count it — union the room
    # ID sets instead for a true cluster-wide distinct count.
    active_rooms = {room_id for w in workers for room_id in w.get("room_ids", [])}
    return {
        "workers": workers,
        "worker_count": len(workers),
        "total_connections": sum(w["conn_count"] for w in workers),
        "active_rooms": len(active_rooms),
    }
