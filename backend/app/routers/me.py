import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.auth import current_profile, current_user_id
from app.config import get_settings
from app.database import get_db
from app.models import Context, DailyTotal, DeletedUser, Goal, Profile
from app.schemas import Export, ProfileOut, ProfilePatch

router = APIRouter(prefix="/me", tags=["me"])
http = httpx.Client(timeout=10)  # tests swap this for a MockTransport client


@router.get("", response_model=ProfileOut)
def get_me(profile: Profile = Depends(current_profile)):
    return profile


@router.patch("", response_model=ProfileOut)
def patch_me(body: ProfilePatch, profile: Profile = Depends(current_profile), db: Session = Depends(get_db)):
    if body.tz is not None:
        profile.tz = body.tz
    if body.settings is not None:
        # Top-level merge: sending only grace_s keeps quiet_hours. Send quiet_hours: [] to clear them.
        changes = body.settings.model_dump(exclude_none=True, by_alias=True)
        profile.settings = {**profile.settings, **changes}
    db.commit()
    return profile


@router.get("/export", response_model=Export)
def export_me(profile: Profile = Depends(current_profile), db: Session = Depends(get_db)):
    uid = profile.user_id
    return {
        "profile": profile,
        "goals": db.scalars(select(Goal).where(Goal.user_id == uid).order_by(Goal.day, Goal.sort, Goal.created_at)).all(),
        "contexts": db.scalars(select(Context).where(Context.user_id == uid).order_by(Context.started_at)).all(),
        "daily": db.scalars(
            select(DailyTotal).where(DailyTotal.user_id == uid).order_by(DailyTotal.day, DailyTotal.device_id)
        ).all(),
    }


def delete_auth_user(user_id: uuid.UUID) -> None:
    """Supabase admin deleteUser. Skipped when no Supabase project is configured (local dev, tests)."""
    s = get_settings()
    if not (s.supabase_url and s.supabase_service_role_key):
        return
    key = s.supabase_service_role_key
    try:
        r = http.delete(
            f"{s.supabase_url.rstrip('/')}/auth/v1/admin/users/{user_id}",
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
        )
    except httpx.HTTPError:
        r = None
    if r is None or (r.status_code >= 400 and r.status_code != 404):  # 404 = already gone, fine
        raise HTTPException(502, "Your data is deleted, but removing the sign-in failed. Please retry.")


@router.delete("", status_code=204)
def delete_me(uid: uuid.UUID = Depends(current_user_id), db: Session = Depends(get_db)):
    # current_user_id, not current_profile: a retry after a 502 must reach here past the tombstone.
    for model in (Goal, Context, DailyTotal, Profile):
        db.execute(delete(model).where(model.user_id == uid))
    if db.get(DeletedUser, uid) is None:  # tombstone: stops a still-valid token re-creating rows
        db.add(DeletedUser(user_id=uid))
    db.commit()
    delete_auth_user(uid)  # after the commit: a failed remote call never leaves app data behind
    return Response(status_code=204)
