"""Seed users + rooms directly in Postgres, bypassing /auth/register (and
its 5/min-per-IP rate limit) entirely. Registering 1000 users through the
real endpoint would take ~3.6h at that pace; this does it in minutes.
pytest's test_auth_api.py already covers the register endpoint itself, so
skipping it here for load-test fixture generation doesn't lose coverage —
the thing load_test.py actually exercises is the WS fan-out, not signup.

Writes the same fixture shape load_test.py's --seed-users produces
(backend/scripts/.loadtest_users.json), so `run()` mode works unchanged.
Overwrites any existing fixture rather than topping it up.

Must run where the app package + DB are reachable — inside the backend
container:
    docker compose exec backend python scripts/db_seed.py --users 1000 --rooms 50
"""
import argparse
import asyncio
import json
import random
import string
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# `python scripts/db_seed.py` only puts scripts/ on sys.path, not the repo
# root where the `app` package lives — add it explicitly.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import jwt
from sqlalchemy import select

from app.config import settings
from app.db.session import AsyncSessionLocal
from app.models.room import Room
from app.models.room_member import RoomMember
from app.models.user import User
from app.services.auth import create_refresh_token, hash_password

FIXTURE_PATH = Path(__file__).parent / ".loadtest_users.json"
PASSWORD = "loadtest-pw-12345"  # never used to log in (tokens are minted directly) — kept for fixture-shape parity

# A batch of 1000+ users can take a while to seed, and a run against them
# might happen well after that — the app's normal 60-min access token
# (settings.jwt_expire_minutes) would leave a seeded pool stale within the
# hour. Mint load-test tokens with a much longer fixed lifetime instead, so
# a pool stays usable across a whole day of testing without every expired
# connect falling back to the rate-limited /auth/refresh endpoint (which
# caps recovery at 30/min regardless of how many users you're simulating).
LOAD_TEST_TOKEN_LIFETIME = timedelta(hours=24)


def create_long_lived_access_token(user_id) -> str:
    expire = datetime.now(timezone.utc) + LOAD_TEST_TOKEN_LIFETIME
    payload = {"sub": str(user_id), "exp": expire, "type": "access"}
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def rand_suffix(n=6):
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=n))


async def ensure_rooms(db, count, creator_id):
    room_names = [f"loadtest-room-{i}" for i in range(count)]
    existing = {
        r.name: r.id
        for r in (await db.execute(select(Room).where(Room.name.in_(room_names)))).scalars()
    }

    room_ids = []
    for name in room_names:
        if name in existing:
            room_ids.append(existing[name])
            continue
        room = Room(name=name, created_by=creator_id)
        db.add(room)
        await db.flush()
        room_ids.append(room.id)
    await db.commit()
    return room_ids


async def seed(args):
    async with AsyncSessionLocal() as db:
        print(f"Creating {args.users} users directly in Postgres (bcrypt hashing is the slow part)...")
        users = []
        for i in range(args.users):
            username = f"loadtest_{i}_{rand_suffix()}"
            user = User(username=username, email=f"{username}@loadtest-app.com", hashed_pw=hash_password(PASSWORD))
            db.add(user)
            await db.flush()  # need user.id for room membership + JWTs below
            users.append(user)
            if (i + 1) % 100 == 0:
                print(f"  {i + 1}/{args.users}")
        await db.commit()

        room_ids = await ensure_rooms(db, args.rooms, users[0].id)

        print(f"Assigning {len(users)} users across {len(room_ids)} rooms...")
        for i, user in enumerate(users):
            db.add(RoomMember(room_id=room_ids[i % len(room_ids)], user_id=user.id))
        await db.commit()

    fixture = {
        "users": [
            {
                "username": u.username,
                "password": PASSWORD,
                "access_token": create_long_lived_access_token(u.id),
                "refresh_token": create_refresh_token(u.id),
            }
            for u in users
        ],
        "rooms": [str(r) for r in room_ids],
    }
    FIXTURE_PATH.write_text(json.dumps(fixture, indent=2))
    print(f"Done: {len(users)} users, {len(room_ids)} rooms -> {FIXTURE_PATH}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--users", type=int, required=True)
    parser.add_argument("--rooms", type=int, default=50)
    asyncio.run(seed(parser.parse_args()))


if __name__ == "__main__":
    main()
