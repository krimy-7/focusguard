from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import Base, SessionLocal, resolve_engine, run_simple_migrations
from app.routers import (
    achievements,
    beast,
    contexts,
    dev,
    events,
    insights,
    interventions,
    mood,
    planning,
    sessions,
    sync,
    tasks,
)
from app.services.mock import seed_database

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine = resolve_engine()
    Base.metadata.create_all(bind=engine)
    run_simple_migrations(engine)
    with SessionLocal(bind=engine) as db:
        if seed_database(db):
            print("[seed] Mock data inserted (first run).")
    yield


app = FastAPI(title=settings.app_name, debug=settings.debug, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=r".*" if settings.debug else None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tasks.router, prefix="/api")
app.include_router(sessions.router, prefix="/api")
app.include_router(events.router, prefix="/api")
app.include_router(insights.router, prefix="/api")
app.include_router(contexts.router, prefix="/api")
app.include_router(planning.router, prefix="/api")
app.include_router(interventions.router, prefix="/api")
app.include_router(mood.router, prefix="/api")
app.include_router(beast.router, prefix="/api")
app.include_router(achievements.router, prefix="/api")
app.include_router(sync.router, prefix="/api")
app.include_router(dev.router, prefix="/api")


class ConnectionManager:
    def __init__(self) -> None:
        self.active: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active:
            self.active.remove(websocket)

    async def broadcast(self, message: dict) -> None:
        for ws in list(self.active):
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect(ws)


manager = ConnectionManager()


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "app": settings.app_name,
        "provider": settings.ai_provider,
        "fallback": "mock",
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            await manager.broadcast({"echo": data})
    except WebSocketDisconnect:
        manager.disconnect(websocket)
