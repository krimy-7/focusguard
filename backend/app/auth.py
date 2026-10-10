import time
import uuid
from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import PyJWKClientConnectionError, PyJWTError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import DeletedUser, Profile

RATE_LIMIT_PER_MIN = 60

_bearer = HTTPBearer(auto_error=False)  # auto_error would answer 403; the contract says 401
_hits: dict[uuid.UUID, tuple[int, int]] = {}  # user_id -> (minute window, requests in it)


@lru_cache
def jwks_client() -> jwt.PyJWKClient:
    # Supabase edge-caches its JWKS for 10 min; caching longer than ~20 min risks missing a key rotation.
    # ponytail: an unknown `kid` makes PyJWKClient refetch the JWKS before any rate limit applies, so junk
    # tokens can each cost one outbound fetch (bounded by timeout=5). Throttle unknown-kid refreshes if abused.
    return jwt.PyJWKClient(get_settings().supabase_jwks_url, lifespan=600, timeout=5)


def _unauthorized() -> HTTPException:
    return HTTPException(401, "Invalid or expired token", headers={"WWW-Authenticate": "Bearer"})


def verify_token(token: str) -> uuid.UUID:
    """Supabase access token -> user id. 401 on anything wrong, 503 if the JWKS can't be fetched."""
    s = get_settings()
    try:
        key = jwks_client().get_signing_key_from_jwt(token).key
        claims = jwt.decode(
            token,
            key,
            algorithms=["ES256"],
            audience=s.supabase_audience,
            issuer=s.supabase_issuer,
            options={"require": ["exp", "sub", "aud", "iss"]},
        )
        return uuid.UUID(claims["sub"])
    except PyJWKClientConnectionError:
        # Not the user's fault: a 401 here would sign every client out during a Supabase blip.
        raise HTTPException(503, "Auth keys unavailable, retry shortly") from None
    except (PyJWTError, ValueError):
        raise _unauthorized() from None


def _minute() -> int:
    return int(time.monotonic() // 60)


def _rate_limit(user_id: uuid.UUID) -> None:
    # ponytail: per-process fixed one-minute window, unlocked dict; correct only while Cloud Run
    # max-instances=1. Move to a Postgres/Redis counter if we ever scale out.
    minute = _minute()
    window, count = _hits.get(user_id, (minute, 0))
    if window != minute:
        count = 0
    if count >= RATE_LIMIT_PER_MIN:
        raise HTTPException(429, "Too many requests", headers={"Retry-After": "60"})
    _hits[user_id] = (minute, count + 1)


def current_user_id(cred: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> uuid.UUID:
    if cred is None:
        raise _unauthorized()
    user_id = verify_token(cred.credentials)
    _rate_limit(user_id)
    return user_id


def current_profile(user_id: uuid.UUID = Depends(current_user_id), db: Session = Depends(get_db)) -> Profile:
    """The caller's profile, created on their first authenticated request (never after DELETE /me)."""
    profile = db.get(Profile, user_id)
    if profile is None:
        # A deleted account's access token stays valid until `exp`; it must not re-create rows
        # under a `sub` nobody can sign in as again (so nobody could export or delete them).
        if db.get(DeletedUser, user_id) is not None:
            from app.routers import me  # lazy: me.py imports app.auth

            # Finish an earlier DELETE /me whose Supabase call hit a 502 (spec §3.3, index R9).
            # Idempotent (404 = already gone); bounded by the 60/min rate limit.
            try:
                me.delete_auth_user(user_id)
            except HTTPException:
                pass
            raise _unauthorized()
        db.add(Profile(user_id=user_id, settings={}))
        try:
            db.commit()
        except IntegrityError:  # a concurrent first request created it
            db.rollback()
        profile = db.get(Profile, user_id)
    return profile
