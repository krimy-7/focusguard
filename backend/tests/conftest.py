import os
import tempfile
import time
import uuid
from datetime import datetime
from pathlib import Path

# Configure before importing the app: settings and the engine are built at import time.
# Explicit empty Supabase values so a developer's backend/.env can never make tests hit the network.
# TEST_DATABASE_URL lets you run the suite against a THROWAWAY Postgres; every table is wiped per test.
BACKEND = Path(__file__).resolve().parents[1]
_db = Path(tempfile.mkdtemp()) / "test.db"
os.environ.update(
    DATABASE_URL=os.environ.get("TEST_DATABASE_URL", f"sqlite:///{_db.as_posix()}"),
    DEBUG="false",
    SUPABASE_URL="",
    SUPABASE_SERVICE_ROLE_KEY="",
    SUPABASE_JWKS_URL="https://test.invalid/auth/v1/.well-known/jwks.json",
    SUPABASE_ISSUER="https://test.invalid/auth/v1",
    SUPABASE_AUDIENCE="authenticated",
    DASHBOARD_ORIGINS="http://localhost:8081,https://app.focusguard.test",
    EXTENSION_ID="abcdefghijklmnopabcdefghijklmnop",
)

import jwt  # noqa: E402
import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import ec  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from jwt.algorithms import ECAlgorithm  # noqa: E402
from sqlalchemy import delete  # noqa: E402

from app import auth, days  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Context, DailyTotal, DeletedUser, Goal, Profile  # noqa: E402

ISSUER = os.environ["SUPABASE_ISSUER"]
KEY = ec.generate_private_key(ec.SECP256R1())
OTHER_KEY = ec.generate_private_key(ec.SECP256R1())  # same curve, not in the JWKS
JWKS = {"keys": [{**ECAlgorithm.to_jwk(KEY.public_key(), as_dict=True), "kid": "test-kid", "alg": "ES256", "use": "sig"}]}

ALICE = uuid.UUID("11111111-1111-4111-8111-111111111111")
BOB = uuid.UUID("22222222-2222-4222-8222-222222222222")


def make_token(sub=ALICE, key=KEY, kid="test-kid", algorithm="ES256", **claims) -> str:
    payload = {
        "sub": str(sub),
        "aud": "authenticated",
        "iss": ISSUER,
        "exp": int(time.time()) + 3600,
        "role": "authenticated",
        **claims,
    }
    return jwt.encode(payload, key, algorithm=algorithm, headers={"kid": kid})


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session", autouse=True)
def _migrated_db():
    command.upgrade(Config(str(BACKEND / "alembic.ini")), "head")


@pytest.fixture(autouse=True)
def _isolated(monkeypatch):
    monkeypatch.setattr(auth.jwks_client(), "fetch_data", lambda: JWKS)  # no network, ever
    auth._hits.clear()
    yield
    with SessionLocal() as db:
        for model in (Goal, Context, DailyTotal, Profile, DeletedUser):  # ALICE/BOB are reused across tests
            db.execute(delete(model))
        db.commit()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def alice():
    return bearer(make_token(ALICE))


@pytest.fixture
def bob():
    return bearer(make_token(BOB))


@pytest.fixture
def freeze(monkeypatch):
    """freeze('2026-10-09T18:25:00+00:00') pins days.utcnow() for 'today' calculations."""

    def _freeze(iso: str):
        monkeypatch.setattr(days, "utcnow", lambda: datetime.fromisoformat(iso))

    return _freeze
