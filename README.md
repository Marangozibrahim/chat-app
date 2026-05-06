# Real-Time Chat App

FastAPI + React + PostgreSQL + Redis. WebSockets, JWT auth, online presence. Deploys to AWS EC2 + ALB + RDS.

## Quick Start (local)

```bash
cp backend/.env.example backend/.env
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000/docs
- Run migrations (first time): `docker compose exec backend alembic upgrade head`

## Stack

| Layer | Tech |
|-------|------|
| API | FastAPI, SQLAlchemy (async), asyncpg |
| Auth | JWT (python-jose), bcrypt (passlib) |
| Real-time | WebSockets, Redis pub/sub |
| Presence | Redis HSET + ZSET |
| DB | PostgreSQL 16, Alembic migrations |
| Frontend | React 18, React Router, axios |
| Deploy | Docker, AWS EC2 + ALB + RDS + ElastiCache |

## Architecture

```
Browser ──WS──► FastAPI ──publish──► Redis pub/sub ──fan-out──► all workers
                   │                                              │
                   └──persist──► PostgreSQL                       └──► local WebSockets
```

## AWS Deploy

See plan file for full topology. Key steps:
1. Push images to ECR
2. Provision RDS (PostgreSQL) + ElastiCache (Redis) in private subnets
3. Launch EC2 with user-data pulling images from ECR
4. ALB on port 443 → EC2:8000 (enable WebSocket: idle timeout ≥ 3600s)
5. `docker exec backend alembic upgrade head` against RDS
