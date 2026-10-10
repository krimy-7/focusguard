import os
import tempfile
from pathlib import Path

# Configure before importing the app: settings are read once at import time.
_db = Path(tempfile.mkdtemp()) / "test.db"
os.environ.update(
    DATABASE_URL=f"sqlite:///{_db.as_posix()}",
    DEMO_MODE="false",
    AI_PROVIDER="mock",
    DEEPSEEK_API_KEY="",
    OPENAI_API_KEY="",
    OPENAI_API_KEY_FIRST="",
    OPENAI_API_KEY_SECOND="",
    CLAUDE_API_KEY="",
    GEMINI_API_KEY="",
)

import httpx  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.database import SessionLocal, resolve_engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import FocusEvent  # noqa: E402
from app.services.ai import AIService  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:  # runs lifespan: create tables (+ seed only if DEMO_MODE)
        yield c


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_no_seed_without_demo_mode(client):
    assert client.get("/api/planning/goals").json() == []
    assert client.get("/api/sessions").json() == []


def test_sync_stores_context_recovery(client):
    r = client.post("/api/sync", json={"platform": "extension", "event": "context_recovery", "payload": {"detail": "back"}})
    assert r.status_code == 200
    with SessionLocal(bind=resolve_engine()) as db:
        assert db.query(FocusEvent).filter(FocusEvent.type == "context_recovery").count() == 1


def test_ai_without_keys_uses_mock(monkeypatch):
    def no_network(*a, **kw):
        raise AssertionError("network call attempted")

    monkeypatch.setattr(httpx, "Client", no_network)
    for provider in ("openai", "claude", "gemini", "deepseek"):
        ai = AIService()
        ai.provider = provider
        assert ai._effective_provider() == "mock"
        assert ai.generate_insight({"stats": {"score": 90}})["message"]
        assert ai.transcribe_audio(b"", "a.wav", "audio/wav") == ""
