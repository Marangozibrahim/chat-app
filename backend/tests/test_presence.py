import time
import uuid

from app.services import presence


async def test_online_then_offline(redis_client):
    room, user = uuid.uuid4(), uuid.uuid4()

    await presence.set_online(redis_client, room, user)
    online = await presence.get_online_user_ids(redis_client, room)
    assert str(user) in online

    await presence.set_offline(redis_client, room, user)
    online = await presence.get_online_user_ids(redis_client, room)
    assert str(user) not in online


async def test_multiple_users_online(redis_client):
    room = uuid.uuid4()
    users = [uuid.uuid4() for _ in range(3)]
    for u in users:
        await presence.set_online(redis_client, room, u)

    online = await presence.get_online_user_ids(redis_client, room)
    assert online == {str(u) for u in users}


async def test_stale_user_evicted(redis_client):
    """A heartbeat older than STALE_SECONDS is dropped from the online set."""
    room, fresh, stale = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()

    await presence.set_online(redis_client, room, fresh)
    # Backdate the stale user's heartbeat past the eviction cutoff.
    old = time.time() - (presence.STALE_SECONDS + 5)
    await redis_client.hset(presence._hkey(room), str(stale), old)
    await redis_client.zadd(presence._zkey(room), {str(stale): old})

    online = await presence.get_online_user_ids(redis_client, room)
    assert str(fresh) in online
    assert str(stale) not in online


async def test_stale_eviction_prunes_zset(redis_client):
    """get_online_user_ids should ZREMRANGEBYSCORE stale entries, not just hide them."""
    room, stale = uuid.uuid4(), uuid.uuid4()
    old = time.time() - (presence.STALE_SECONDS + 5)
    await redis_client.zadd(presence._zkey(room), {str(stale): old})

    await presence.get_online_user_ids(redis_client, room)

    remaining = await redis_client.zcard(presence._zkey(room))
    assert remaining == 0


async def test_refresh_keeps_user_online(redis_client):
    room, user = uuid.uuid4(), uuid.uuid4()
    # Seed a heartbeat that is about to go stale.
    old = time.time() - (presence.STALE_SECONDS - 1)
    await redis_client.hset(presence._hkey(room), str(user), old)
    await redis_client.zadd(presence._zkey(room), {str(user): old})

    await presence.refresh_presence(redis_client, room, user)

    online = await presence.get_online_user_ids(redis_client, room)
    assert str(user) in online


async def test_mark_and_get_seen(redis_client):
    room, user = uuid.uuid4(), uuid.uuid4()
    msg_id = str(uuid.uuid4())

    await presence.mark_seen(redis_client, room, user, msg_id)
    seen = await presence.get_seen(redis_client, room)

    assert seen == {str(user): msg_id}


async def test_seen_overwrites_previous(redis_client):
    room, user = uuid.uuid4(), uuid.uuid4()
    first, second = str(uuid.uuid4()), str(uuid.uuid4())

    await presence.mark_seen(redis_client, room, user, first)
    await presence.mark_seen(redis_client, room, user, second)

    seen = await presence.get_seen(redis_client, room)
    assert seen[str(user)] == second
