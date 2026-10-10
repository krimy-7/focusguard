from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import contexts, daily, goals, me

settings = get_settings()

app = FastAPI(title="FocusGuard API", debug=settings.debug)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,  # exact origins only, never a chrome-extension://* regex
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
    expose_headers=["Retry-After"],  # not CORS-safelisted; without this, clients can't read R9's 429 back-off
)


app.include_router(me.router, prefix="/api")
app.include_router(goals.router, prefix="/api")
app.include_router(contexts.router, prefix="/api")
app.include_router(daily.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}
