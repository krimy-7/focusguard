import httpx
from sqlalchemy import func, select

from app.config import get_settings
from app.database import SessionLocal
from app.models import Context, DailyTotal, Goal, Profile
from app.routers import me
import pytest

from tests.conftest import ALICE, BOB


def test_patch_tz_and_settings(client, alice):
    r = client.patch("/api/me", json={"tz": "America/New_York", "settings": {"grace_s": 120}}, headers=alice)
    assert r.status_code == 200
    assert r.json() == {"user_id": str(ALICE), "tz": "America/New_York", "settings": {"grace_s": 120}}
    quiet = [{"from": "22:00", "to": "07:00"}]
    r = client.patch("/api/me", json={"settings": {"quiet_hours": quiet}}, headers=alice)
    assert r.json()["settings"] == {"grace_s": 120, "quiet_hours": quiet}  # merged, grace_s kept
    r = client.patch("/api/me", json={"settings": {"quiet_hours": [], "grace_s": 900}}, headers=alice)
    assert r.json()["settings"] == {"grace_s": 900, "quiet_hours": []}
    assert client.get("/api/me", headers=alice).json()["settings"] == {"grace_s": 900, "quiet_hours": []}


@pytest.mark.parametrize(
    "body",
    [
        {"tz": "Mars/Phobos"},
        {"tz": "../../etc/passwd"},
        {"tz": "+05:45"},
        {"settings": {"grace_s": 119}},
        {"settings": {"grace_s": 901}},
        {"settings": {"quiet_hours": [{"from": "22:00", "to": "07:00"}] * 4}},
        {"settings": {"quiet_hours": [{"from": "24:00", "to": "07:00"}]}},
        {"settings": {"quiet_hours": [{"from": "9:00", "to": "10:00"}]}},
        {"settings": {"quiet_hours": [{"from": "22:00"}]}},
        {"settings": {"ai_key": "sk-123"}},
        {"user_id": str(BOB)},
    ],
)
def test_patch_validation(client, alice, body):
    assert client.patch("/api/me", json=body, headers=alice).status_code == 422


def test_patch_is_isolated(client, alice, bob):
    client.patch("/api/me", json={"tz": "UTC", "settings": {"grace_s": 600}}, headers=alice)
    assert client.get("/api/me", headers=bob).json() == {"user_id": str(BOB), "tz": "Asia/Kathmandu", "settings": {}}


CONTEXT = {
    "id": "ctx-1", "device_id": "dev-1", "title": "Thesis", "mode": "work", "state": "active",
    "confidence": "confirmed", "started_at": "2026-10-10T03:00:00Z", "ended_at": None,
    "last_active_at": "2026-10-10T04:00:00Z", "sites": ["docs.google.com"],
}
DAILY = {
    "day": "2026-10-10", "device_id": "dev-1", "focus_s": 60, "nudges": 1, "self_returns": 0,
    "recoveries": 0, "snoozes": 0, "breaks": 0, "longest_detour_s": 30,
}


def seed(client, headers):
    goals = client.post("/api/goals", json={"lines": "a\nb", "day": "2026-10-10"}, headers=headers).json()
    client.put("/api/contexts/ctx-1", json=CONTEXT, headers=headers)
    client.put("/api/daily/2026-10-10", json=DAILY, headers=headers)
    return goals


def row_counts(user_id):
    with SessionLocal() as db:
        return {
            m.__tablename__: db.scalar(select(func.count()).select_from(m).where(m.user_id == user_id))
            for m in (Profile, Goal, Context, DailyTotal)
        }


def test_export_is_complete_and_scoped(client, alice, bob):
    goals = seed(client, alice)
    seed(client, bob)
    r = client.get("/api/me/export", headers=alice)
    assert r.status_code == 200
    data = r.json()
    assert set(data) == {"profile", "goals", "contexts", "daily"}
    assert data["profile"] == {"user_id": str(ALICE), "tz": "Asia/Kathmandu", "settings": {}}
    assert data["goals"] == goals
    assert data["contexts"] == [CONTEXT]
    assert data["daily"] == [DAILY]
    assert len(data["goals"]) == row_counts(ALICE)["goals"]


def test_delete_removes_every_row_and_only_mine(client, alice, bob, monkeypatch):
    def no_network(request):
        raise AssertionError("Supabase is not configured; no remote call expected")

    monkeypatch.setattr(me, "http", httpx.Client(transport=httpx.MockTransport(no_network)))
    seed(client, alice)
    seed(client, bob)
    assert client.delete("/api/me", headers=alice).status_code == 204
    assert row_counts(ALICE) == {"profiles": 0, "goals": 0, "contexts": 0, "daily_totals": 0}
    assert row_counts(BOB) == {"profiles": 1, "goals": 2, "contexts": 1, "daily_totals": 1}


def test_token_used_after_delete_cannot_recreate_data(client, alice):
    # The extension's own session keeps a valid access token for up to 1 h after the dashboard deletes.
    seed(client, alice)
    assert client.delete("/api/me", headers=alice).status_code == 204
    assert client.put("/api/daily/2026-10-10", json=DAILY, headers=alice).status_code == 401
    assert client.put("/api/contexts/ctx-1", json=CONTEXT, headers=alice).status_code == 401
    assert client.get("/api/me", headers=alice).status_code == 401
    assert row_counts(ALICE) == {"profiles": 0, "goals": 0, "contexts": 0, "daily_totals": 0}
    assert client.delete("/api/me", headers=alice).status_code == 204  # R9 retry still reaches it


@pytest.fixture
def supabase(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "supabase_url", "https://proj.supabase.co/")
    monkeypatch.setattr(s, "supabase_service_role_key", "service-role-secret")
    calls = []

    def use(status: int):
        def handler(request: httpx.Request) -> httpx.Response:
            calls.append(request)
            return httpx.Response(status, json={})

        monkeypatch.setattr(me, "http", httpx.Client(transport=httpx.MockTransport(handler)))

    return use, calls


def test_delete_calls_supabase_admin_api(client, alice, supabase):
    use, calls = supabase
    use(200)
    assert client.delete("/api/me", headers=alice).status_code == 204
    [req] = calls
    assert req.method == "DELETE"
    assert str(req.url) == f"https://proj.supabase.co/auth/v1/admin/users/{ALICE}"
    assert req.headers["apikey"] == "service-role-secret"
    assert req.headers["authorization"] == "Bearer service-role-secret"


def test_delete_treats_remote_404_as_done(client, alice, supabase):
    use, _ = supabase
    use(404)
    assert client.delete("/api/me", headers=alice).status_code == 204


def test_delete_remote_failure_is_502_after_data_is_gone(client, alice, supabase):
    use, _ = supabase
    use(500)
    seed(client, alice)
    r = client.delete("/api/me", headers=alice)
    assert r.status_code == 502
    assert row_counts(ALICE) == {"profiles": 0, "goals": 0, "contexts": 0, "daily_totals": 0}
    use(200)
    assert client.delete("/api/me", headers=alice).status_code == 204  # retry succeeds


def test_request_after_failed_delete_finishes_auth_removal(client, alice, supabase):
    # User reloads / leaves Settings after the 502 instead of retrying: every screen calls GET /me first.
    use, calls = supabase
    use(500)
    assert client.delete("/api/me", headers=alice).status_code == 502
    assert client.get("/api/me", headers=alice).status_code == 401  # remote still failing: still a clean 401
    calls.clear()
    use(200)
    assert client.get("/api/me", headers=alice).status_code == 401
    [req] = calls
    assert req.method == "DELETE"
    assert str(req.url) == f"https://proj.supabase.co/auth/v1/admin/users/{ALICE}"
