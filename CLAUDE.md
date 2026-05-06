# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from the repo root (`chat-app/`) unless noted.

### Full stack (Docker)
```bash
docker compose up --build          # start all services
docker compose up --build -d       # detached
docker compose exec backend alembic upgrade head   # run migrations (required on first start)
docker compose down                # stop
```

### Backend (from `backend/`)
```bash
uvicorn app.main:app --reload      # dev server on :8000
alembic upgrade head               # apply migrations
alembic revision --autogenerate -m "description"  # generate migration after model changes
pytest --asyncio-mode=auto         # all tests
pytest --asyncio-mode=auto -k test_auth   # single test module
```

### Frontend (from `frontend/`)
```bash
npm install
npm run dev        # dev server on :3000
npm run build      # production build → dist/
```

### Interactive debug
```bash
docker compose exec backend bash
docker compose exec postgres psql -U chat -d chatdb
docker compose exec redis redis-cli
```

## Architecture

### Message flow
```
Browser ──WS──► FastAPI ──PUBLISH──► Redis pub/sub ──fan-out──► all workers
                   │                                              │
                   └──persist──► PostgreSQL                       └──► local WebSockets
```

Each worker process runs one background asyncio task (`ws/redis_listener.py`) that does `psubscribe("pubsub:room:*")`. When a message arrives it calls `ConnectionManager.broadcast_local` to push to all WebSockets on that worker. This is what makes horizontal scaling work — workers don't need to know about each other.

### WebSocket handshake
JWT is passed as a query param (`/ws/rooms/{room_id}?token=<jwt>`) because the browser WebSocket API cannot send custom headers on the upgrade request. The server validates the token before `ws.accept()` and closes with code 4001 if invalid.

### Presence
Redis HSET (`presence:room:{id}` → `user_id: unix_timestamp`) + ZSET (`presence:room:{id}:zset`) dual structure. HSET gives O(1) user lookup; ZSET enables `ZREMRANGEBYSCORE` to evict stale entries (> 60s without heartbeat) without scanning all fields. Clients send `{"type":"ping"}` every 30s to refresh.

### Message history pagination
Cursor-based: `WHERE created_at < :before ORDER BY created_at DESC LIMIT n`. Backed by `idx_messages_room_created (room_id, created_at DESC)`. History loads via REST on room join, then WebSocket takes over for live messages — no gap between them.

### Backend layout
- `app/main.py` — app factory, CORS, lifespan (starts Redis listener, opens/closes Redis pool)
- `app/dependencies.py` — `get_db`, `get_redis`, `get_current_user` FastAPI deps; Redis pool singleton
- `app/ws/manager.py` — `ConnectionManager` singleton: `room_id → set[WebSocket]`, lock-protected
- `app/ws/redis_listener.py` — long-running background coroutine, started in lifespan
- `app/services/presence.py` — all Redis HSET/ZSET presence logic
- `app/routers/ws.py` — WebSocket endpoint: JWT validation, message loop, presence lifecycle on connect/disconnect

### Frontend layout
- `src/hooks/useChatSocket.js` — owns the WebSocket lifecycle; feeds messages and presence events to UI
- `src/hooks/usePresence.js` — manages the online members list from presence events
- `src/context/AuthContext.jsx` — JWT token in `localStorage`; provides `loginUser`, `logout`, `isAuth`
- `src/api/client.js` — axios instance; request interceptor injects `Authorization: Bearer` header
- Vite dev proxy: `/api/*` → `backend:8000/*`, `/ws/*` → `ws://backend:8000/ws/*`

### Environment variables (backend)
All read via Pydantic `BaseSettings` from `.env`:
```
DATABASE_URL   postgresql+asyncpg://...
REDIS_URL      redis://...
JWT_SECRET     <secret>
JWT_EXPIRE_MINUTES  60
```

Copy `backend/.env.example` to `backend/.env` before running locally outside Docker.

### Migrations
Models live in `app/models/`. After changing a model, run `alembic revision --autogenerate -m "description"` then `alembic upgrade head`. Alembic `env.py` imports all models via `app/models/__init__.py` to register them with metadata — keep that import up to date when adding new models.
