import time

import jwt
import pytest
from jwt.exceptions import PyJWKClientConnectionError

from app import auth
from tests.conftest import ALICE, BOB, ISSUER, KEY, OTHER_KEY, bearer, make_token


def test_valid_token_creates_profile_on_first_request(client):
    r = client.get("/api/me", headers=bearer(make_token(ALICE)))
    assert r.status_code == 200
    assert r.json() == {"user_id": str(ALICE), "tz": "Asia/Kathmandu", "settings": {}}


def test_missing_header_is_401_not_403(client):
    r = client.get("/api/me")
    assert r.status_code == 401
    assert r.json() == {"detail": "Invalid or expired token"}
    assert r.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize(
    "token",
    [
        pytest.param(lambda: make_token(exp=int(time.time()) - 10), id="expired"),
        pytest.param(lambda: make_token(aud="anon"), id="wrong-aud"),
        pytest.param(lambda: make_token(iss="https://evil.example/auth/v1"), id="wrong-iss"),
        pytest.param(lambda: make_token(key=OTHER_KEY), id="wrong-key-same-kid"),
        pytest.param(lambda: make_token(kid="unknown-kid"), id="unknown-kid"),
        pytest.param(lambda: make_token(sub="not-a-uuid"), id="non-uuid-sub"),
        pytest.param(lambda: make_token(key="shared-secret", algorithm="HS256"), id="hs256-alg-confusion"),
        pytest.param(lambda: "not.a.jwt", id="garbage"),
    ],
)
def test_bad_tokens_are_401(client, token):
    r = client.get("/api/me", headers=bearer(token()))
    assert r.status_code == 401
    assert r.json() == {"detail": "Invalid or expired token"}


def test_token_without_exp_is_401(client):
    token = jwt.encode({"sub": str(ALICE), "aud": "authenticated", "iss": ISSUER}, KEY, algorithm="ES256",
                       headers={"kid": "test-kid"})
    assert client.get("/api/me", headers=bearer(token)).status_code == 401


def test_non_bearer_scheme_is_401(client):
    assert client.get("/api/me", headers={"Authorization": f"Basic {make_token()}"}).status_code == 401


def test_jwks_outage_is_503_not_401(client, monkeypatch):
    def down():
        raise PyJWKClientConnectionError("boom")

    monkeypatch.setattr(auth.jwks_client(), "fetch_data", down)
    assert client.get("/api/me", headers=bearer(make_token())).status_code == 503


def test_jwks_cached_for_ten_minutes():
    assert auth.jwks_client().jwk_set_cache.lifespan == 600


def test_rate_limit_is_per_user(client, monkeypatch):
    monkeypatch.setattr(auth, "RATE_LIMIT_PER_MIN", 3)
    alice, bob = bearer(make_token(ALICE)), bearer(make_token(BOB))
    assert [client.get("/api/me", headers=alice).status_code for _ in range(3)] == [200, 200, 200]
    ext = "chrome-extension://abcdefghijklmnopabcdefghijklmnop"
    r = client.get("/api/me", headers={**alice, "Origin": ext})
    assert r.status_code == 429
    assert r.headers["retry-after"] == "60"
    # TestClient ignores CORS, so check the browser can actually read Retry-After cross-origin (R9).
    assert r.headers["access-control-allow-origin"] == ext
    assert "retry-after" in r.headers["access-control-expose-headers"].lower()
    assert client.get("/api/me", headers=bob).status_code == 200


def test_rate_limit_window_resets(client, monkeypatch):
    monkeypatch.setattr(auth, "RATE_LIMIT_PER_MIN", 1)
    minute = [1000]
    monkeypatch.setattr(auth, "_minute", lambda: minute[0])
    headers = bearer(make_token())
    assert client.get("/api/me", headers=headers).status_code == 200
    assert client.get("/api/me", headers=headers).status_code == 429
    minute[0] += 1
    assert client.get("/api/me", headers=headers).status_code == 200
