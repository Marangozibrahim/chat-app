"""End-to-end WebSocket handshake through the real ws.py endpoint, driven by
Starlette's TestClient (which runs the app lifespan: Redis pool + pub/sub
listener). Proves JWT gating on the upgrade and that a connected client
receives its own presence-join broadcast off the Redis round-trip.
"""
import asyncio

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool
from starlette.websockets import WebSocketDisconnect

import app.models  # noqa: F401
from app.config import settings
from app.db.base import Base
from app.main import app
from app.services.auth import create_access_token, hash_password


async def _seed_user():
    """Create tables and one user; return its id. Runs in its own loop."""
    import uuid

    from app.models.user import User

    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    from sqlalchemy.ext.asyncio import async_sessionmaker

    user_id = uuid.uuid4()
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        s.add(User(id=user_id, username="wsuser", email="ws@example.com",
                   hashed_pw=hash_password("pw123456")))
        await s.commit()
    await engine.dispose()
    return user_id


@pytest.fixture(autouse=True)
def fresh_module_engine():
    """The WS endpoint uses the module-level AsyncSessionLocal/engine, whose pool
    binds to the first event loop that touches it. Each TestClient runs in a new
    loop, so dispose the pool before every test to avoid 'attached to a different
    loop'. asyncio.run gives a throwaway loop just for the dispose() call.
    """
    from app.db.session import engine

    asyncio.run(engine.dispose())
    yield
    asyncio.run(engine.dispose())


@pytest.fixture
def seeded_user_id():
    return asyncio.run(_seed_user())


def test_ws_rejects_missing_token():
    with TestClient(app) as tc:
        with pytest.raises(WebSocketDisconnect):
            # No token query param → endpoint closes 4001 before accept.
            with tc.websocket_connect("/ws/rooms/00000000-0000-0000-0000-000000000000"):
                pass


def test_ws_rejects_bad_token():
    with TestClient(app) as tc:
        with pytest.raises(WebSocketDisconnect):
            with tc.websocket_connect(
                "/ws/rooms/00000000-0000-0000-0000-000000000000?token=garbage"
            ):
                pass


def test_ws_valid_token_connects_and_gets_presence(seeded_user_id):
    token = create_access_token(seeded_user_id)
    room_id = "11111111-1111-1111-1111-111111111111"
    with TestClient(app) as tc:
        with tc.websocket_connect(f"/ws/rooms/{room_id}?token={token}") as ws:
            event = ws.receive_json()
            assert event["type"] == "presence"
            assert event["event"] == "joined"
            assert event["username"] == "wsuser"


def test_ws_ping_pong(seeded_user_id):
    token = create_access_token(seeded_user_id)
    room_id = "22222222-2222-2222-2222-222222222222"
    with TestClient(app) as tc:
        with tc.websocket_connect(f"/ws/rooms/{room_id}?token={token}") as ws:
            ws.receive_json()  # drain presence-join
            ws.send_json({"type": "ping"})
            # pong may arrive after the presence echo; scan a couple frames.
            for _ in range(3):
                msg = ws.receive_json()
                if msg["type"] == "pong":
                    break
            else:
                pytest.fail("no pong received")
