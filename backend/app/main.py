from contextlib import asynccontextmanager

from fastapi import FastAPI
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
    allow_origin_regex=r"^chrome-extension://.*$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
if settings.enable_dev_routes:
    app.include_router(dev.router, prefix="/api")


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "app": settings.app_name,
        "provider": settings.ai_provider,
        "fallback": "mock",
    }

