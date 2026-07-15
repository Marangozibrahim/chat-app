import time

import pytest

from app.config import settings
from app.dependencies import get_redis
from app.main import app
from app.services import worker_registry


@pytest.fixture(autouse=True)
def admin_token():
    original = settings.admin_token
    settings.admin_token = "test-admin-secret"
    yield settings.admin_token
    settings.admin_token = original


@pytest.fixture(autouse=True)
def override_redis(redis_client):
    """The `client` fixture's ASGITransport doesn't run app lifespan, so the
    module-level Redis pool get_redis() reads is never initialized. Point it
    at the test's own redis_client instead, same as conftest does for get_db.
    """
    async def _get_redis():
        return redis_client

    app.dependency_overrides[get_redis] = _get_redis
    yield
    app.dependency_overrides.pop(get_redis, None)


async def test_missing_token_forbidden(client):
    resp = await client.get("/admin/workers")
    assert resp.status_code == 403


async def test_wrong_token_forbidden(client):
    resp = await client.get("/admin/workers", headers={"X-Admin-Token": "nope"})
    assert resp.status_code == 403


async def test_unconfigured_token_refuses_everyone(client, admin_token):
    settings.admin_token = ""
    resp = await client.get("/admin/workers", headers={"X-Admin-Token": ""})
    assert resp.status_code == 403


async def test_lists_live_workers(client, admin_token, redis_client):
    await worker_registry.heartbeat(redis_client, "worker-a", time.time(), conn_count=3, room_ids=["r1", "r2"])

    resp = await client.get("/admin/workers", headers={"X-Admin-Token": admin_token})
    assert resp.status_code == 200
    body = resp.json()
    assert body["worker_count"] == 1
    assert body["total_connections"] == 3
    assert body["active_rooms"] == 2
    assert body["workers"][0]["worker_id"] == "worker-a"


async def test_active_rooms_deduplicates_across_workers(client, admin_token, redis_client):
    """A room with connections on two different workers should count once,
    not twice — /admin/workers unions room IDs rather than summing counts.
    """
    await worker_registry.heartbeat(redis_client, "worker-a", time.time(), conn_count=2, room_ids=["shared", "only-a"])
    await worker_registry.heartbeat(redis_client, "worker-b", time.time(), conn_count=2, room_ids=["shared", "only-b"])

    resp = await client.get("/admin/workers", headers={"X-Admin-Token": admin_token})
    body = resp.json()
    assert body["worker_count"] == 2
    assert body["active_rooms"] == 3  # shared, only-a, only-b — not 4


async def test_stale_worker_evicted(client, admin_token, redis_client):
    old = time.time() - (worker_registry.STALE_SECONDS + 5)
    await worker_registry.heartbeat(redis_client, "worker-stale", old, conn_count=1, room_ids=["r1"])
    # Backdate the score directly — heartbeat() always writes "now" for the zset.
    await redis_client.zadd(worker_registry._ZKEY, {"worker-stale": old})

    resp = await client.get("/admin/workers", headers={"X-Admin-Token": admin_token})
    body = resp.json()
    assert body["worker_count"] == 0

    remaining = await redis_client.zcard(worker_registry._ZKEY)
    assert remaining == 0


async def test_deregister_removes_worker(redis_client):
    await worker_registry.heartbeat(redis_client, "worker-b", time.time(), conn_count=1, room_ids=["r1"])
    await worker_registry.deregister(redis_client, "worker-b")

    workers = await worker_registry.get_live_workers(redis_client)
    assert workers == []
