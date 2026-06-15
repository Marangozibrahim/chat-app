# Real-Time Chat App

A horizontally-scalable, real-time group chat application built with **FastAPI**, **React**, **PostgreSQL**, and **Redis**. Messages, presence, typing indicators, and read receipts all flow over WebSockets, fanned out across multiple worker processes via Redis pub/sub. File and video attachments upload directly to S3 via presigned URLs.

The interesting part isn't the chat — it's that the entire real-time layer is built to scale across processes and machines without any worker needing to know another exists.

---

## Highlights

- **Multi-worker WebSocket fan-out via Redis pub/sub** — each worker process subscribes to `pubsub:room:*` and rebroadcasts to its own local sockets. Workers never talk to each other directly, so you can scale to N processes (or N machines behind a load balancer) with zero coordination code. This is the core design decision the rest of the app is built around.
- **O(1) presence with automatic stale eviction** — a dual Redis `HSET` + `ZSET` structure. The `HSET` gives O(1) user lookup; the `ZSET` (scored by heartbeat timestamp) lets `ZREMRANGEBYSCORE` evict everyone idle >60s without scanning. Clients heartbeat every 30s.
- **WhatsApp-style read receipts (double tick)** — read state lives in a Redis `HSET` (`user_id → last_seen_message_id`); the frontend resolves a `seenCursorIndex` so every one of your messages up to the point another user has read shows a blue double tick. Receipts fire on connect, not just on send, so ticks appear immediately.
- **Seamless history + live handoff** — cursor-based pagination (`WHERE created_at < :before ORDER BY created_at DESC`) backed by a composite index. History loads over REST on join, then the WebSocket takes over for live messages with no gap and no duplicates.
- **Direct-to-S3 uploads** — the backend only ever hands out presigned PUT URLs; file bytes never pass through the API. Supports images, video (`<video controls>` inline), PDFs, and documents up to 500 MB.
- **Resilient client** — exponential-backoff WebSocket reconnect (1s → 30s cap), scroll-position-preserving infinite scroll, an unread-messages divider, dark/light theming, and a "Reconnecting…" banner.
- **Access + refresh JWTs** — short-lived access token (60 min) plus a long-lived refresh token (30 days). The axios client transparently refreshes on a 401 and retries the original request (single-flight, so a burst of 401s triggers one refresh), keeping users logged in without a hard mid-session logout. Tokens are typed, so a refresh token can't be used as an access token and vice versa.
- **Rate limiting + input caps** — Redis-backed per-IP limits on auth routes (slowapi) hold across all workers, blunting brute-force and signup spam. Message bodies are length-capped at the schema and WebSocket layers.
- **Production-minded** — explicit CORS allowlist, health check endpoint, GitHub Actions CI (migrations + pytest + frontend build + docker build), Alembic migrations, and a documented AWS EC2 deployment.

---

## Quick Start (local, Docker)

```bash
# 1. Copy env templates and fill in secrets
cp .env.example .env
cp backend/.env.example backend/.env

# 2. Bring up postgres, redis, backend, frontend
docker compose up --build

# 3. Run migrations (first time only)
docker compose exec backend alembic upgrade head
```

| Service        | URL                              |
|----------------|----------------------------------|
| Frontend       | http://localhost:3000            |
| Backend API    | http://localhost:8000            |
| API docs (Swagger) | http://localhost:8000/docs   |
| Health check   | http://localhost:8000/health     |

File uploads require AWS S3 credentials in `.env` (see [Environment](#environment-variables)). The app runs fine without them — only attachments will fail.

---

## Stack

| Layer       | Tech                                                         |
|-------------|-------------------------------------------------------------|
| API         | FastAPI 0.115, SQLAlchemy 2.0 (async), asyncpg              |
| Auth        | JWT (`python-jose`), password hashing via `bcrypt` directly  |
| Real-time   | WebSockets, Redis pub/sub                                    |
| Presence    | Redis `HSET` + `ZSET`                                        |
| Storage     | AWS S3 (boto3, presigned URLs)                               |
| Database    | PostgreSQL 16, Alembic migrations                            |
| Frontend    | React 18, React Router 6, axios, Tailwind CSS v4 (Vite plugin) |
| Tooling     | Docker Compose, GitHub Actions CI                           |

---

## Architecture

### Message flow

```
Browser ──WS──► FastAPI ──PUBLISH──► Redis pub/sub ──fan-out──► all workers
                   │                                              │
                   └──persist──► PostgreSQL                       └──► local WebSockets
```

Every worker process runs a single long-lived asyncio task (`ws/redis_listener.py`) doing `psubscribe("pubsub:room:*")`. When a message lands on a channel, the listener calls `ConnectionManager.broadcast_local` to push it to every WebSocket that worker holds for that room. A message sent on worker A reaches a client on worker B purely through Redis — that's what makes horizontal scaling free.

### WebSocket handshake

The JWT is passed as a query param (`/ws/rooms/{room_id}?token=<jwt>`) because the browser WebSocket API can't set custom headers on the upgrade request. The server validates the token and looks up the user **before** `ws.accept()`, closing with code `4001` on failure (the client treats `4001` as fatal and skips reconnect).

### Client → server messages

| type      | payload              | description                                          |
|-----------|----------------------|------------------------------------------------------|
| `ping`    | —                    | heartbeat; server replies `pong`, refreshes presence |
| `message` | `body: string`       | send a chat message                                  |
| `typing`  | —                    | broadcast a typing event to the room                 |
| `seen`    | `message_id: string` | mark a message read; stored in `seen:room:{id}`      |

### Server → client events

| type             | payload                       | description                |
|------------------|-------------------------------|----------------------------|
| `message`        | full message object           | new message broadcast      |
| `message_edited` | `id, body, edited_at`         | edit broadcast             |
| `message_deleted`| `id`                          | delete broadcast           |
| `presence`       | `user_id, username, event`    | joined / left              |
| `typing`         | `user_id, username`           | user is typing             |
| `seen`           | `user_id, username, message_id` | read receipt             |
| `pong`           | —                             | heartbeat reply            |

### Presence model

```
presence:room:{id}        HSET   user_id → unix_timestamp      (O(1) lookup)
presence:room:{id}:zset   ZSET   user_id scored by timestamp   (stale eviction)
seen:room:{id}            HSET   user_id → last_seen_message_id (read receipts)
```

Stale members (>60s without a heartbeat) are evicted with `ZREMRANGEBYSCORE` — no full scan needed.

---

## Project Layout

### Backend (`backend/app/`)

```
main.py              app factory, CORS, lifespan (starts Redis listener + pool)
config.py            Pydantic BaseSettings, reads .env
dependencies.py      get_db / get_redis / get_current_user; Redis pool singleton
models/              SQLAlchemy models: user, room, room_member, message
schemas/             Pydantic request/response schemas
routers/
  auth.py            register / login / refresh → JWT (rate-limited)
  rooms.py           rooms CRUD, members + online status, seen state
  messages.py        cursor-paginated history, edit (PATCH), delete (DELETE)
  uploads.py         presigned upload URL + confirm-upload
  ws.py              WebSocket endpoint: JWT validation, message/typing/seen/ping
services/
  auth.py            bcrypt hashing, JWT encode/decode
  message.py         persist / history / edit / delete
  presence.py        all Redis presence + read-receipt logic
  room.py            room queries (member_count via isolated subquery)
  storage.py         S3 presigned URLs, MIME allowlist, object deletion
ws/
  manager.py         ConnectionManager singleton: room_id → set[WebSocket], lock-guarded
  redis_listener.py  background psubscribe coroutine, fans out to local sockets
db/migrations/       Alembic
```

### Frontend (`frontend/src/`)

```
hooks/
  useChatSocket.js   WS lifecycle, backoff reconnect, send/typing/seen helpers
  usePresence.js     online-members list from presence events
context/
  AuthContext.jsx    JWT in localStorage; loginUser / logout / isAuth
  ThemeContext.jsx   dark/light, defaults to system preference
components/
  MessageList.jsx    messages, new-message divider, infinite scroll up,
                     inline edit, delete modal, double-tick, media rendering
  MessageInput.jsx   forwardRef input, ArrowUp-to-edit, paperclip upload + progress
  TypingIndicator.jsx animated dots (3s auto-clear per user)
api/
  client.js          axios instance, Bearer-token request interceptor
  rooms.js / messages.js / uploads.js / auth.js
pages/
  ChatPage.jsx       unified history+live state, pagination, divider, seen map
  RoomsPage.jsx      room list with live unread indicators (5s poll)
  LoginPage.jsx / RegisterPage.jsx
```

---

## Notable Implementation Details

- **Unread counts** — `RoomOut` exposes `last_message_at`; the frontend compares it against a `visited:{roomId}` timestamp written to `localStorage` on room exit. The rooms list polls every 5s for live indicators.
- **New-messages divider** — on join, the first message newer than `visited:{roomId}` gets a blue `── X new messages ──` divider, and `useLayoutEffect` scrolls to it before first paint.
- **Scroll preservation on prepend** — when loading older messages, `scrollHeight` is snapshotted before the fetch and `scrollTop` is adjusted by the delta after, so the viewport doesn't jump.
- **Edit / delete** — owner-only. Edits broadcast `message_edited`; deletes are soft (`deleted=true`, body cleared) and broadcast `message_deleted`. ArrowUp in an empty input edits your last message; an empty edit opens the delete modal.
- **CORS-safe S3 uploads** — `ContentType` is deliberately left out of the signed PUT headers (including it triggers an S3 CORS preflight 500), and a regional `endpoint_url` is forced to avoid presigned-URL signature mismatches.
- **Windows Docker HMR** — `CHOKIDAR_USEPOLLING=true` + Vite `watch.usePolling` are required for hot reload inside Docker on Windows.
- **`React.StrictMode` intentionally removed** — its double-mount breaks the WebSocket lifecycle in dev.

---

## Commands

### Backend (from `backend/`)

```bash
uvicorn app.main:app --reload                       # dev server on :8000
alembic upgrade head                                # apply migrations
alembic revision --autogenerate -m "description"    # new migration after model change
pytest --asyncio-mode=auto                          # all tests
pytest --asyncio-mode=auto -k test_auth             # single module
```

### Frontend (from `frontend/`)

```bash
npm install
npm run dev        # dev server on :3000
npm run build      # production build → dist/
```

### Debugging

```bash
docker compose exec backend bash
docker compose exec postgres psql -U postgres -d chatdb
docker compose exec redis redis-cli

docker compose exec redis redis-cli HGETALL presence:room:<id>
docker compose exec redis redis-cli HGETALL seen:room:<id>
docker compose exec redis redis-cli MONITOR        # live command stream
```

---

## Environment Variables

Backend settings are read from `.env` via Pydantic `BaseSettings`:

```
DATABASE_URL          postgresql+asyncpg://postgres:<pass>@postgres:5432/chatdb
REDIS_URL             redis://redis:6379/0
JWT_SECRET            <secret>
JWT_EXPIRE_MINUTES    60                 # access token lifetime
JWT_REFRESH_EXPIRE_DAYS 30               # refresh token lifetime
AWS_ACCESS_KEY_ID     <iam key>          # optional — uploads only
AWS_SECRET_ACCESS_KEY <iam secret>       # optional — uploads only
AWS_REGION            eu-north-1
S3_BUCKET             <bucket name>
MAX_UPLOAD_BYTES      524288000          # 500 MB
PRESIGNED_URL_EXPIRY  3600
MAX_MESSAGE_CHARS     4000               # max chat message length
CORS_ORIGINS_RAW      http://localhost:3000,http://localhost:5173  # CSV of allowed origins
```

Two `.env` files, both gitignored:

- **`.env`** (repo root) — consumed by `docker compose` via `env_file`; holds `POSTGRES_PASSWORD`.
- **`backend/.env`** — used by `uvicorn` when running outside Docker; `DATABASE_URL` points at `localhost`.

`.env.example` and `backend/.env.example` are committed as safe templates. **AWS keys and `S3_BUCKET` belong only in `.env`, never in `docker-compose.yml`.**

### S3 bucket setup (for attachments)

- Block Public Access **OFF**
- A public-read bucket policy
- CORS config allowing `PUT` + `GET` from the app's origins

Allowed upload types: `image/jpeg png gif webp`, `video/mp4 webm quicktime`, `application/pdf`, `text/plain`, `application/zip`, `.docx`, `.xlsx`.

---

## Security

What's in place:

- **Password hashing** with `bcrypt` (per-password salt), never stored or logged in plaintext.
- **Typed JWTs** — access and refresh tokens carry a `type` claim, so a refresh token can't be replayed as an access token (and vice versa). Short access lifetime (60 min) limits the window of a leaked access token.
- **Per-IP rate limiting** (slowapi, Redis-backed) on auth routes to blunt brute-force and signup spam, enforced across all workers.
- **Explicit CORS allowlist** — `allow_origins=["*"]` with credentials is invalid per the CORS spec and unsafe, so origins are configured explicitly via `CORS_ORIGINS_RAW`.
- **Input caps** — message bodies are length-limited at the schema and WebSocket layers; React escapes rendered message bodies by default (no `dangerouslySetInnerHTML`), so message content isn't an XSS vector.
- **Membership checks** on room messaging and uploads (403 if not a member).

Known tradeoffs (deliberate, called out rather than hidden):

- **Tokens live in `localStorage`.** This is common in SPAs but is readable by any injected JavaScript, so it does not fully mitigate XSS — and the long-lived refresh token makes that more costly than an access token alone. The hardened approach is to store the **refresh token in an `HttpOnly` + `Secure` + `SameSite` cookie** (unreadable by JS) and keep only the short-lived access token in memory; that adds CSRF surface, which a `SameSite` policy plus a CSRF token would cover. Left as localStorage here to keep the auth flow simple for a demo.
- **WebSocket auth passes the JWT as a query parameter** (`/ws/rooms/{id}?token=…`) because the browser WebSocket API can't set custom headers on the upgrade. Query strings can land in server/proxy logs, so in production this should be paired with short token TTLs and log scrubbing, or a short-lived single-use WS ticket exchanged over REST first.
- **JWTs are stateless** — logout clears client storage but does not revoke a token server-side. Immediate revocation would need a token blocklist (e.g. in Redis) or rotating the signing secret.

---

## Testing & CI

GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs on every push and PR to `main`:

1. **backend** — spins up postgres + redis services, runs `alembic upgrade head`, then `pytest`. The suite covers auth (service + API), presence (online/offline, stale eviction, read receipts against real Redis), the Redis pub/sub fan-out that powers horizontal scaling, and the WebSocket handshake (JWT gating, presence broadcast, ping/pong).
2. **frontend** — `npm install` + `npm run build`.
3. **docker-build** — `docker compose build` to catch image regressions.

---

## Deployment (AWS EC2)

Deployed on an EC2 `t3.micro` (Ubuntu 24.04) running `docker-compose` directly. Security group opens ports `22, 80, 443, 3000, 8000`. For browser clients to reach the backend, `VITE_API_URL` and `VITE_WS_URL` in `docker-compose.yml` must point to the EC2 public IP rather than `localhost`. When fronting with an ALB, enable WebSocket support and set the idle timeout ≥ 3600s.

---

## Data Model

```
users         id, username (unique), email (unique), hashed_pw, created_at
rooms         id, name (unique), created_by → users, created_at
room_members  (room_id, user_id) composite PK, joined_at
messages      id, room_id → rooms, user_id → users, body, created_at,
              edited_at, deleted, attachment_url
              └─ idx_messages_room_created (room_id, created_at)
```

Foreign keys cascade on room delete; `user_id` is `SET NULL` on user delete so message history survives.
