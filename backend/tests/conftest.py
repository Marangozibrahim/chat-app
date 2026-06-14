import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

import app.models  # noqa: F401 — registers all models on Base.metadata
from app.config import settings
from app.db.base import Base
from app.dependencies import get_db
from app.main import app


@pytest_asyncio.fixture(scope="function")
async def db_session_maker():
    """Per-test engine bound to the current event loop.

    A module-level engine reuses a connection pool tied to the loop that first
    touched it; pytest-asyncio runs each test in a fresh loop, which triggers
    "another operation is in progress" / "attached to a different loop". A
    NullPool engine created and disposed inside the test sidesteps that.
    """
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def client(db_session_maker):
    async def override_get_db():
        async with db_session_maker() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
