import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.dependencies import close_redis, init_redis
from app.routers import auth, messages, rooms, uploads
from app.routers import ws as ws_router
from app.ws.manager import manager
from app.ws.redis_listener import listen


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_redis()
    listener_task = asyncio.create_task(listen(manager))
    yield
    listener_task.cancel()
    await close_redis()


app = FastAPI(title="Chat API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(rooms.router)
app.include_router(messages.router)
app.include_router(uploads.router)
app.include_router(ws_router.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
