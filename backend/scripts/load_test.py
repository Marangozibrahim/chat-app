"""Mock concurrent chat-app users to see how the app handles traffic.

Two modes:

  Seed (one-time, or to top up the pool):
      python load_test.py --seed-users 30 --rooms 3

  Run (replays the cached pool, fast — no registration):
      python load_test.py --users 30 --duration 60 --admin-token <ADMIN_TOKEN>

`--base-url` defaults to http://localhost:3000 (through the Vite dev proxy),
not :8000 directly — that's what actually spreads connections across a
`docker compose --scale backend=N` stack, since Docker's embedded DNS
round-robins new connections to `backend` across every replica the same way
it does for a real browser. See docker-compose.loadtest.yml.

At high concurrency (several hundred+), going through `localhost` on Windows
hits Docker Desktop's host port-forwarding relay, which has its own
concurrency ceiling unrelated to the app. For real scale, run this script
*inside* the compose network instead, talking to `backend:8000` directly
(same round-robin across replicas, no host relay in the way) — pass
`--api-prefix ""` since REST routes have no /api prefix without Vite/nginx
in front to add one:

    docker run --rm --network chat-app_default \
      -v "${PWD}/backend/scripts:/scripts" python:3.12-slim sh -c \
      "pip install -q httpx websockets && python /scripts/load_test.py \
       --base-url http://backend:8000 --api-prefix '' --users 1000 ..."

Registration is rate-limited server-side (5/min per IP — see
app/routers/auth.py), so seeding paces itself and caches the resulting users
to .loadtest_users.json (gitignored) for reuse across runs.
"""
import argparse
import asyncio
import json
import random
import string
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx
import websockets

FIXTURE_PATH = Path(__file__).parent / ".loadtest_users.json"

REGISTER_INTERVAL = 13  # seconds; keeps us under the 5/min register limit
REFRESH_INTERVAL = 2.5  # seconds; keeps us under the 30/min refresh limit
LOGIN_INTERVAL = 6.5    # seconds; keeps us under the 10/min login limit (refresh fallback)


def rand_suffix(n=6):
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=n))


def load_fixture():
    if FIXTURE_PATH.exists():
        return json.loads(FIXTURE_PATH.read_text())
    return {"users": [], "rooms": []}


def save_fixture(data):
    FIXTURE_PATH.write_text(json.dumps(data, indent=2))


async def register_user(client, base_url, api_prefix, idx):
    username = f"loadtest_{idx}_{rand_suffix()}"
    password = "loadtest-pw-12345"
    resp = await client.post(
        f"{base_url}{api_prefix}/auth/register",
        # A .test/.local/.invalid/.example domain trips pydantic's EmailStr —
        # email-validator rejects RFC 2606/6761 special-use domains outright.
        json={"username": username, "email": f"{username}@loadtest-app.com", "password": password},
    )
    resp.raise_for_status()
    tokens = resp.json()
    return {
        "username": username,
        "password": password,
        "access_token": tokens["access_token"],
        "refresh_token": tokens["refresh_token"],
    }


async def refresh_user(client, base_url, api_prefix, user):
    resp = await client.post(f"{base_url}{api_prefix}/auth/refresh", json={"refresh_token": user["refresh_token"]})
    resp.raise_for_status()
    tokens = resp.json()
    user["access_token"] = tokens["access_token"]
    if tokens.get("refresh_token"):
        user["refresh_token"] = tokens["refresh_token"]


async def login_user(client, base_url, api_prefix, user):
    resp = await client.post(
        f"{base_url}{api_prefix}/auth/login", json={"username": user["username"], "password": user["password"]}
    )
    resp.raise_for_status()
    tokens = resp.json()
    user["access_token"] = tokens["access_token"]
    user["refresh_token"] = tokens["refresh_token"]


async def refresh_all(client, base_url, api_prefix, users):
    """Refresh every cached user's access token. A refresh failure (expired
    30-day refresh token, but the account still exists) falls back to a
    plain login. If both fail — e.g. the dev DB got wiped/recreated between
    seed runs — the user is dead and gets pruned from the list in place, so
    `seed()`'s registration pass replaces it instead of carrying a
    permanently-broken entry forward into every future run.
    """
    dead = []
    for i, user in enumerate(users):
        try:
            await refresh_user(client, base_url, api_prefix, user)
        except httpx.HTTPStatusError:
            await asyncio.sleep(LOGIN_INTERVAL)
            try:
                await login_user(client, base_url, api_prefix, user)
                print(f"  refresh expired for {user['username']}, logged in instead")
            except httpx.HTTPStatusError:
                print(f"  {user['username']} no longer exists — will re-register")
                dead.append(user)
        if i < len(users) - 1:
            await asyncio.sleep(REFRESH_INTERVAL)

    for user in dead:
        users.remove(user)
    return len(dead)


async def ensure_rooms(client, base_url, api_prefix, token, room_names):
    headers = {"Authorization": f"Bearer {token}"}
    resp = await client.get(f"{base_url}{api_prefix}/rooms", headers=headers)
    resp.raise_for_status()
    existing = {r["name"]: r["id"] for r in resp.json()}

    room_ids = []
    for name in room_names:
        if name in existing:
            room_ids.append(existing[name])
            continue
        resp = await client.post(f"{base_url}{api_prefix}/rooms", json={"name": name}, headers=headers)
        resp.raise_for_status()
        room_ids.append(resp.json()["id"])
    return room_ids


async def join_room(client, base_url, api_prefix, token, room_id):
    headers = {"Authorization": f"Bearer {token}"}
    resp = await client.post(f"{base_url}{api_prefix}/rooms/{room_id}/join", headers=headers)
    resp.raise_for_status()


async def seed(args):
    data = load_fixture()
    async with httpx.AsyncClient(timeout=10) as client:
        if data["users"]:
            print(f"Refreshing tokens for {len(data['users'])} cached users...")
            pruned = await refresh_all(client, args.base_url, args.api_prefix, data["users"])
            if pruned:
                print(f"Pruned {pruned} dead user(s) from the pool.")
            save_fixture(data)

        existing = len(data["users"])
        to_create = max(0, args.seed_users - existing)
        if to_create:
            eta = to_create * REGISTER_INTERVAL
            print(f"Registering {to_create} new users (~{eta:.0f}s, register is rate-limited to 5/min)...")
        for i in range(to_create):
            user = await register_user(client, args.base_url, args.api_prefix, existing + i)
            data["users"].append(user)
            save_fixture(data)  # incremental save so a crash mid-seed doesn't lose progress
            print(f"  [{i + 1}/{to_create}] registered {user['username']}")
            if i < to_create - 1:
                await asyncio.sleep(REGISTER_INTERVAL)

        if not data["users"]:
            print("No users to seed rooms with — pass --seed-users N > 0.")
            sys.exit(1)

        room_names = [f"loadtest-room-{i}" for i in range(args.rooms)]
        room_ids = await ensure_rooms(client, args.base_url, args.api_prefix, data["users"][0]["access_token"], room_names)
        data["rooms"] = room_ids
        save_fixture(data)

        print("Joining users to rooms...")
        for i, user in enumerate(data["users"]):
            await join_room(client, args.base_url, args.api_prefix, user["access_token"], room_ids[i % len(room_ids)])

    print(f"Done: {len(data['users'])} users, {len(room_ids)} rooms cached at {FIXTURE_PATH}")


class Stats:
    def __init__(self):
        self.started_at = datetime.now(timezone.utc).isoformat()
        self.connected = 0
        self.connect_failed = 0
        self.sent = 0
        self.received = 0
        self.errors = 0
        self.latencies = []
        self.sample_connect_error = None


async def user_session(base_url, ws_base, user, room_id, args, stats, initial_delay):
    await asyncio.sleep(initial_delay)

    async with httpx.AsyncClient(timeout=10) as reauth_client:
        uri = f"{ws_base}/ws/rooms/{room_id}?token={user['access_token']}"
        ws = None
        for attempt in range(2):
            try:
                ws = await websockets.connect(uri, open_timeout=10, ping_interval=None)
                break
            except Exception as e:
                if stats.sample_connect_error is None:
                    stats.sample_connect_error = f"{type(e).__name__}: {e}"
                if attempt == 0:
                    try:
                        await refresh_user(reauth_client, base_url, args.api_prefix, user)
                        uri = f"{ws_base}/ws/rooms/{room_id}?token={user['access_token']}"
                    except Exception:
                        pass

    if ws is None:
        stats.connect_failed += 1
        return
    stats.connected += 1

    async def sender():
        msg_interval = 60 / args.msg_rate if args.msg_rate > 0 else None
        last_ping = last_msg = time.monotonic()
        while True:
            now = time.monotonic()
            if now - last_ping >= 30:
                await ws.send(json.dumps({"type": "ping"}))
                last_ping = now
            if msg_interval and now - last_msg >= msg_interval:
                marker = time.time()
                body = f"[lt:{marker}] hello from {user['username']}"
                await ws.send(json.dumps({"type": "message", "body": body}))
                stats.sent += 1
                last_msg = now
            await asyncio.sleep(1)

    async def receiver():
        try:
            async for raw in ws:
                try:
                    evt = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if evt.get("type") == "message":
                    stats.received += 1
                    body = evt.get("body") or ""
                    if body.startswith("[lt:"):
                        try:
                            marker = float(body[4:body.index("]")])
                            stats.latencies.append(time.time() - marker)
                        except ValueError:
                            pass
        except Exception:
            stats.errors += 1

    try:
        await asyncio.gather(sender(), receiver())
    except asyncio.CancelledError:
        pass
    finally:
        await ws.close()


async def poll_admin(client, base_url, api_prefix, admin_token, snapshots):
    start = time.time()
    try:
        while True:
            try:
                resp = await client.get(
                    f"{base_url}{api_prefix}/admin/workers", headers={"X-Admin-Token": admin_token}
                )
                if resp.status_code == 200:
                    snapshots.append((time.time() - start, resp.json()))
            except Exception:
                pass
            await asyncio.sleep(5)
    except asyncio.CancelledError:
        pass


def build_report(args, stats, admin_snapshots):
    """Collect the run's results into a plain dict — printed, and written to --out."""
    report = {
        "started_at": stats.started_at,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "config": {
            "base_url": args.base_url,
            "api_prefix": args.api_prefix,
            "users": args.users,
            "rooms": args.rooms,
            "duration_s": args.duration,
            "ramp_up_s": args.ramp_up,
            "msg_rate_per_min": args.msg_rate,
        },
        "connections": {
            "connected": stats.connected,
            "connect_failed": stats.connect_failed,
            "sample_connect_error": stats.sample_connect_error,
        },
        "messages": {"sent": stats.sent, "received": stats.received, "errors": stats.errors},
        "latency_ms": None,
        "worker_snapshots": [
            {
                "t": round(t, 1),
                "worker_count": snap["worker_count"],
                "total_connections": snap["total_connections"],
                "active_rooms": snap["active_rooms"],
            }
            for t, snap in admin_snapshots
        ],
    }
    if stats.latencies:
        lat = sorted(stats.latencies)
        report["latency_ms"] = {
            "p50": round(lat[len(lat) // 2] * 1000),
            "p95": round(lat[int(len(lat) * 0.95)] * 1000),
            "max": round(lat[-1] * 1000),
            "n": len(lat),
        }
    return report


def print_report(report):
    cfg, conns, msgs = report["config"], report["connections"], report["messages"]
    print("\n=== Load test report ===")
    print(f"Users: {cfg['users']}  Duration: {cfg['duration_s']}s  Target rate: {cfg['msg_rate_per_min']}/min/user")
    print(f"Connected: {conns['connected']}  Connect failures: {conns['connect_failed']}")
    if conns["sample_connect_error"]:
        print(f"Sample connect error: {conns['sample_connect_error']}")
    print(f"Messages sent: {msgs['sent']}  Received (echoed back to sender): {msgs['received']}")
    print(f"Errors: {msgs['errors']}")
    lat = report["latency_ms"]
    if lat:
        print(f"Latency send->echo: p50={lat['p50']}ms  p95={lat['p95']}ms  max={lat['max']}ms  (n={lat['n']})")
    if report["worker_snapshots"]:
        print("\nWorker snapshots (from /admin/workers):")
        for snap in report["worker_snapshots"]:
            print(f"  t+{snap['t']:5.0f}s  workers={snap['worker_count']}  connections={snap['total_connections']}  active_rooms={snap['active_rooms']}")


async def run(args):
    data = load_fixture()
    if len(data["users"]) < args.users:
        print(f"Only {len(data['users'])} users cached, need {args.users}. Run --seed-users {args.users} first.")
        sys.exit(1)
    if not data["rooms"]:
        print("No rooms cached. Run --seed-users first.")
        sys.exit(1)

    users = data["users"][: args.users]
    room_ids = data["rooms"]
    ws_base = args.base_url.replace("https://", "wss://").replace("http://", "ws://")

    stats = Stats()
    admin_snapshots = []

    tasks = [
        asyncio.create_task(
            user_session(
                args.base_url,
                ws_base,
                user,
                room_ids[i % len(room_ids)],
                args,
                stats,
                initial_delay=(i / len(users)) * args.ramp_up,
            )
        )
        for i, user in enumerate(users)
    ]

    admin_task = None
    if args.admin_token:
        async with httpx.AsyncClient(timeout=10) as admin_client:
            admin_task = asyncio.create_task(
                poll_admin(admin_client, args.base_url, args.api_prefix, args.admin_token, admin_snapshots)
            )
            await asyncio.sleep(args.ramp_up + args.duration)
            admin_task.cancel()
            await asyncio.gather(admin_task, return_exceptions=True)
    else:
        await asyncio.sleep(args.ramp_up + args.duration)

    for t in tasks:
        t.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)

    report = build_report(args, stats, admin_snapshots)
    print_report(report)
    if args.out:
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(report, indent=2))
        print(f"\nReport written to {out}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base-url", default="http://localhost:3000")
    parser.add_argument(
        "--api-prefix", default="/api",
        help="REST path prefix. Default '/api' matches Vite/nginx's proxy rewrite; "
             "pass '' when --base-url points straight at the backend (e.g. inside the compose network)",
    )
    parser.add_argument("--seed-users", type=int, default=None, help="Seed/top up the cached pool to N users, then exit")
    parser.add_argument("--rooms", type=int, default=3, help="Rooms to distribute seeded users across")
    parser.add_argument("--users", type=int, default=10, help="Cached users to simulate in a run")
    parser.add_argument("--duration", type=float, default=60, help="Run duration in seconds")
    parser.add_argument("--msg-rate", type=float, default=6, help="Messages per minute per simulated user")
    parser.add_argument("--ramp-up", type=float, default=10, help="Spread connection starts over this many seconds")
    parser.add_argument("--admin-token", default=None, help="Also poll /admin/workers during the run")
    parser.add_argument("--out", default=None, help="Write the run report as JSON to this path")
    args = parser.parse_args()

    if args.seed_users is not None:
        asyncio.run(seed(args))
    else:
        asyncio.run(run(args))


if __name__ == "__main__":
    main()
