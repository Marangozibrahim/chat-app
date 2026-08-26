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
- **Live worker dashboard + traffic simulator** — every backend process heartbeats its identity and local connection count into Redis (`/admin/workers`, token-gated); a bundled asyncio [load-test script](#load-testing) plus a distributed Locust setup mock up to 1000 concurrent chatting users so you can actually watch the multi-worker fan-out do its job ([measured results](#measured-results)).
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

The compose file also defines an edge `nginx` + `certbot` pair used for the [EC2 TLS deployment](#deployment-aws-ec2) — ignore them for local dev and hit the app directly via the URLs above; `nginx` won't come up cleanly without certs.

---

## Stack

| Layer       | Tech                                                         |
|-------------|-------------------------------------------------------------|
| API         | FastAPI 0.115, SQLAlchemy 2.0 (async), asyncpg              |
| Auth        | JWT (`PyJWT`), password hashing via `bcrypt` directly        |
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

### Worker registry

```
workers:heartbeat        HSET   worker_id → {hostname, pid, started_at, last_heartbeat, conn_count, room_count}
workers:heartbeat:zset   ZSET   worker_id scored by last_heartbeat   (stale eviction)
```

Same HSET+ZSET shape as presence, one level up: each backend process heartbeats itself every 10s instead of each user. `conn_count`/`room_count` come straight from that process's own in-memory `ConnectionManager` — no cross-process bookkeeping needed. `GET /admin/workers` (gated by an `ADMIN_TOKEN` header) reads it back for the [`/admin` dashboard](#load-testing). A graceful shutdown deregisters immediately; a hard kill falls back to the 30s stale eviction.

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
  admin.py           GET /admin/workers, gated by ADMIN_TOKEN header
  ws.py              WebSocket endpoint: JWT validation, message/typing/seen/ping
services/
  auth.py            bcrypt hashing, JWT encode/decode
  message.py         persist / history / edit / delete
  presence.py        all Redis presence + read-receipt logic
  room.py            room queries (member_count via isolated subquery)
  storage.py         S3 presigned URLs, MIME allowlist, object deletion
  worker_registry.py per-process heartbeat + live-worker listing for /admin/workers
ws/
  manager.py         ConnectionManager singleton: room_id → set[WebSocket], lock-guarded
  redis_listener.py  background psubscribe coroutine, fans out to local sockets
db/migrations/       Alembic
scripts/
  load_test.py       asyncio traffic simulator (see Load Testing below)
  db_seed.py          direct-to-Postgres fixture generator for large-scale load tests
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
  admin.js           bare axios call with X-Admin-Token header (separate credential from client.js)
pages/
  ChatPage.jsx       unified history+live state, pagination, divider, seen map
  RoomsPage.jsx      room list with live unread indicators (5s poll)
  LoginPage.jsx / RegisterPage.jsx
  AdminPage.jsx      /admin worker dashboard, 5s poll, token in sessionStorage
```

### Load testing (`loadtest/`, `backend/scripts/`)

```
loadtest/
  Dockerfile          python:3.12-slim + locust + websocket-client
  requirements.txt
  locustfile.py        ChatUser: custom WS client via events.request.fire(),
                        reads the shared fixture, ping/message tasks
backend/scripts/
  db_seed.py           direct-to-Postgres seeder (bypasses register's rate limit,
                        mints 24h tokens) — shared by both tools below
  load_test.py          standalone asyncio CLI load generator, no GUI/distribution
  .loadtest_users.json  gitignored fixture both tools read
loadtest/results/       run output from both tools (gitignored) - see Where the results end up
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
- **Admin dashboard is a separate credential** — `/admin` isn't behind the chat-user `ProtectedRoute`; it's gated by its own `ADMIN_TOKEN`, entered client-side and kept in `sessionStorage` rather than `localStorage` since it's a standing secret that shouldn't outlive the tab.

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
ADMIN_TOKEN           <secret>           # gates GET /admin/workers; empty = refuses everyone
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

1. **backend** — spins up postgres + redis services, runs `alembic upgrade head`, then `pytest`. The suite covers auth (service + API), presence (online/offline, stale eviction, read receipts against real Redis), the Redis pub/sub fan-out that powers horizontal scaling, the WebSocket handshake (JWT gating, presence broadcast, ping/pong), and the worker registry behind `/admin/workers` (token gating, heartbeat round-trip, stale eviction).
2. **frontend** — `npm install`, `npm test` (Vitest: axios refresh-on-401 interceptor + AuthContext token lifecycle), then `npm run build`.
3. **docker-build** — `docker compose build` to catch image regressions.

---

## Load Testing

Watch the multi-worker fan-out actually happen: scale the backend, hit `/admin` to see workers appear, then throw simulated traffic at it.

```bash
# 1. Set ADMIN_TOKEN in .env, then scale the dev backend to 3 replicas
docker compose -f docker-compose.yml -f docker-compose.loadtest.yml up --build --scale backend=3

# 2. Open http://localhost:3000/admin and enter your ADMIN_TOKEN — you should see 3 workers

# 3. One-time: seed a pool of test users (paced under the register rate limit, ~13s/user)
pip install -r backend/scripts/requirements.txt
python backend/scripts/load_test.py --seed-users 30 --rooms 3

# 4. Run traffic against the scaled stack
python backend/scripts/load_test.py --users 30 --duration 60 --admin-token <ADMIN_TOKEN>
```

`docker-compose.loadtest.yml` frees the fixed `127.0.0.1:8000` host-port publish on `backend` so `--scale` can bind multiple replicas (it also defines the Locust master/worker pair used further down) — no load balancer needed, since `vite.config.js` already proxies `/api`/`/ws` to the `backend` **service name**, and Docker's embedded DNS round-robins new connections across every replica of a scaled service, same as it would for a real browser hitting `localhost:3000`.

`load_test.py` mocks concurrent users end-to-end: register (seed mode only), join a room, open a real WebSocket connection, send `ping`/`message`/`typing` like the real client, and measure round-trip latency by timestamping each sent message and parsing it back out of its own echoed broadcast. Seeded users and their tokens are cached in `backend/scripts/.loadtest_users.json` (gitignored) so subsequent runs skip registration entirely — registration is rate-limited to 5/min per IP, so re-registering every run would be painfully slow. Pass `--admin-token` to fold a live worker/connection timeline into the final report.

Run `python backend/scripts/load_test.py --help` for all flags (`--rooms`, `--msg-rate`, `--ramp-up`, `--duration`, `--base-url`, `--api-prefix`, `--out`).

### Testing at real scale (100s–1000s of users) — Locust GUI

`--seed-users` + `python load_test.py` doesn't scale past a few hundred users well: registration is rate-limited to 5/min per IP (seeding 1000 users would take ~3.6h), and on Windows, `localhost:3000` routes through Docker Desktop's host port-forwarding relay, which has its own concurrency ceiling well under 1000 (connections past it silently hang instead of failing). Both are solved the same way `load_test.py`'s scale mode solves them (see below) — but for real scale with a live GUI and the ability to add more load-generating capacity on the fly, use **Locust** (`loadtest/`) instead of the CLI script:

```bash
# 1. Seed directly in Postgres (bypasses the rate limit, mints 24h tokens
#    so the pool survives a full day of testing — see below for why)
docker compose exec backend python scripts/db_seed.py --users 1000 --rooms 50

# 2. Bring up the scaled backend + Locust master/worker pair
docker compose -f docker-compose.yml -f docker-compose.loadtest.yml \
  up --build --scale backend=3 --scale locust-worker=3

# 3. Open Locust's own web UI
open http://localhost:8089
```

Set "Number of users" and "Spawn rate" in the Locust UI, hit Start — live charts (requests/s, response times, failure rate), adjustable mid-run, no restart needed to change the target user count. Need more load-generating throughput? Scale workers up on the fly and Locust's master auto-discovers them:

```bash
docker compose -f docker-compose.yml -f docker-compose.loadtest.yml up -d --scale locust-worker=8
```

`loadtest/locustfile.py` defines a `ChatUser` that opens a real WebSocket to `/ws/rooms/{id}` using a randomly-picked cached user + room from the same `.loadtest_users.json` fixture `db_seed.py` produces, then sends `ping`/`message` at Locust-controlled pacing. No off-the-shelf Locust WebSocket plugin exists for this Locust version, so it's a small custom `User` class using `websocket-client` + Locust's own `events.request.fire()` — the documented, standard way Locust supports any non-HTTP protocol (same pattern real deployments use for gRPC, Kafka, raw sockets, etc).

Both the Locust master and its workers talk to `backend:8000` directly inside the compose network — same reasoning as the CLI script's scale mode: sidesteps the Windows relay bottleneck entirely, and Docker's embedded DNS still round-robins across scaled `backend` replicas the same way it does for a real browser.

Cross-check with the app's own dashboard at the same time: `http://localhost:3000/admin` (there's a "Load Test (Locust) →" link on that page once `locust-master` is running) shows `worker_count`, live `total_connections`, and `active_rooms` from the app's side, right next to Locust's view of the traffic it's generating.

### Testing at scale from the CLI (no GUI needed)

For a quick scale test without spinning up Locust, `load_test.py` supports the same two fixes directly:

```bash
docker compose exec backend python scripts/db_seed.py --users 1000 --rooms 50

docker run --rm --network chat-app_default -v "${PWD}/backend/scripts:/scripts" -v "${PWD}/loadtest/results:/results" python:3.12-slim sh -c \
  "pip install -q httpx websockets && python /scripts/load_test.py \
   --base-url http://backend:8000 --api-prefix '' \
   --users 1000 --rooms 50 --msg-rate 2 --duration 60 --ramp-up 60 \
   --admin-token <ADMIN_TOKEN> --out /results/cli-1000.json"
```

At high user counts, widen `--rooms` so per-room broadcast fan-out doesn't blow up — e.g. 1000 users in 3 rooms means every message fans out to ~333 sockets; 1000 users in 50 rooms (~20/room) keeps delivery volume sane. Lower `--msg-rate` for the first big run too.

### Where the results end up

Neither tool used to keep anything: the CLI script printed its report to stdout, and
Locust held stats only in the master's memory, so results died with the terminal or the
container. Both now persist to `loadtest/results/` (gitignored, regenerated per run):

| File | Written by | When |
|------|-----------|------|
| `run_stats.csv`, `run_failures.csv` | `locust-master --csv` | continuously during the run |
| `run_stats_history.csv` | `--csv-full-history` | one row per stats interval - the timeline behind the charts |
| `report.html` | `--html` | only when Locust exits *normally* - a `--headless -t <time>` run, or Ctrl+C in a foreground master. `docker compose stop` sends SIGTERM, which skips the write (verified: `locust/main.py` calls `save_html_report()` after `main_greenlet.join()` and on KeyboardInterrupt, not from its SIGTERM handler) |
| `<name>.json` | `load_test.py --out <path>` | end of run - config, connect failures, latency percentiles, worker snapshots |

Locust's CSVs are also downloadable from the UI's "Download Data" tab mid-run; the files
above are the same data, written to the host automatically so results outlive the container
once it is gone. They are *not* append-only across runs, though: the master truncates and
rewrites them, so a fresh run - or a restart of the master container - replaces whatever was
there.

For a UI-driven run, grab the HTML report from the master **while it is still running** rather
than relying on the `--html` write at exit:

```bash
curl -s "http://localhost:8089/stats/report?download=1" -o loadtest/results/report.html
```

Stopping the *run* (Stop in the UI) keeps the master alive and leaves the CSVs final; restarting
the master **container** resets them, so copy anything you want to keep first.

### Measured results

Both tools were run at 1000 simulated users against 3 backend replicas, on a 12-core
Windows host under Docker Desktop, with the load generators inside the compose network
(so Docker Desktop's host port-forwarding relay is out of the path). Raw output is in
`loadtest/results/`.

**`load_test.py`** - 1000 users, 50 rooms, 60s ramp + 60s hold, 2 messages/min/user:

| | |
|---|---|
| Connections established | 1000 / 1000, 0 connect failures |
| Messages sent | 2,499 |
| Broadcasts received | 47,709 (~19x fan-out, matching ~20 users/room) |
| Round-trip send -> echo | **p50 8ms, p95 19ms, max 97ms** (n=47,709) |
| Errors | 0 |

Connections ramped linearly (73 -> 241 -> 407 -> 576 -> 740 -> 907 -> 1000) with no
latency degradation as they climbed - p95 stayed at 19ms with all 1000 sockets live.

**Locust** - 1000 users, 50 rooms, 25 users/s spawn rate, 3 workers:

| | |
|---|---|
| `connect` | 1000 requests, 0 failures, median 41ms / p95 170ms |
| `ping` | 5,978 requests, 0 failures |
| `message` | 1,983 requests, 0 failures |
| Connections per backend replica | 351 / 324 / 325 |
| `run_failures.csv` | empty (header only) |

The even split across replicas is Docker's embedded DNS round-robin doing the work a load
balancer would - each new WebSocket resolves `backend` independently. `/admin/workers`
reported the same 1000 connections across 3 workers at the same moment, which is the
cross-check that the dashboard and the load tool agree.

Two load-generator bugs turned up on the way to those numbers, both fixed - see the
`ChatUser` notes in `loadtest/locustfile.py`: a `create_connection` timeout that also
applied to `recv` (killing the reader after 10 quiet seconds, so uvicorn's WebSocket pings
went unanswered and the server dropped every connection about a minute in), and the
locustfile being baked into the image rather than mounted, so edits appeared to have no
effect until a rebuild.

### Gotchas when re-running

- **Re-seeded the pool? Restart Locust.** `locustfile.py` reads the fixture at import, so the
  containers keep using the old pool's tokens after `db_seed.py` runs again. Stale tokens fail the
  WebSocket handshake as HTTP `403` (the server closes before `accept()`, so the client never sees
  close code 4001).
- **Running the Locust flow? Scale both services in the same command.**
  `docker compose ... up --scale backend=3 --scale locust-worker=3` - naming only one converges the
  other back to a single replica, silently. (The CLI-only flow at the top of this section scales just
  `backend` on purpose; it never uses the Locust workers.)
- **Editing `locustfile.py` needs no rebuild** (it is bind-mounted over the image's baked copy), but it
  does need `docker compose restart locust-worker locust-master`.

---

## Deployment (AWS EC2)

Deployed on an EC2 `t3.micro` (Ubuntu 24.04) running `docker-compose` directly behind an `nginx` + Let's Encrypt TLS edge proxy, live at `https://chatapp.ibrahimmarangoz.com`.

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend alembic upgrade head
```

`docker-compose.prod.yml` builds the prod Docker targets (gunicorn backend, static-build frontend served by nginx) and strips backend/frontend/postgres/redis port publishing entirely — the edge `nginx` service (80/443) is the only thing reachable from outside the box. The frontend calls the API/WS same-origin (relative `/api`, `location.host` for WS), so no `VITE_API_URL`/`VITE_WS_URL` is needed. Security group only needs `22, 80, 443` open.

**First-time TLS bootstrap** on a fresh box: run `nginx/init-letsencrypt.sh` — it issues a throwaway self-signed cert so `nginx` can start, requests a real cert from Let's Encrypt over the webroot HTTP-01 challenge, then reloads nginx. The `certbot` service (already in the base `docker-compose.yml`) renews the cert automatically every 12h afterward.

There are two nginx hops in front of the backend: the edge `nginx` (TLS termination, `nginx/conf.d/app.conf`) proxies to the `frontend` container, whose own nginx (`frontend/nginx.conf`, baked into the prod image) serves the built SPA and forwards `/api` and `/ws` to `backend:8000`. Both hops append to `X-Forwarded-For`, so the backend's rate limiter reads the leftmost entry rather than the raw socket peer to get the real client IP.

Note: the base `docker-compose.yml` (used for local dev too) already defines the `nginx`/`certbot` services. They aren't needed for local development — use `localhost:3000`/`localhost:8000` directly — and `nginx` won't start cleanly without certs unless `init-letsencrypt.sh` has been run.

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
