from datetime import datetime, timedelta, timezone

from sqlalchemy import inspect

from app.database import Base, SessionLocal, engine
from app.days import day_bounds
from app.models import Context

ALICE_ID = "11111111-1111-4111-8111-111111111111"


def test_health_is_public_and_minimal(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_old_hackathon_routes_are_gone(client):
    for path in ("/api/sessions", "/api/sync", "/api/planning/goals", "/api/dev/reset", "/api/insights/today"):
        assert client.get(path).status_code in (404, 405), path


def test_migration_matches_models():
    insp = inspect(engine)
    assert set(insp.get_table_names()) - {"alembic_version"} == set(Base.metadata.tables)
    for name, table in Base.metadata.tables.items():
        assert {c["name"] for c in insp.get_columns(name)} == set(table.columns.keys()), name


def test_datetimes_round_trip_as_aware_utc():
    import uuid

    kathmandu = timezone(timedelta(hours=5, minutes=45))
    uid = uuid.UUID(ALICE_ID)
    with SessionLocal() as db:
        db.add(
            Context(
                user_id=uid, id="c1", device_id="d1", title="t", mode="work", state="active",
                confidence="inferred", started_at=datetime(2026, 10, 10, 0, 10, tzinfo=kathmandu),
                last_active_at=datetime(2026, 10, 10, 0, 10, tzinfo=kathmandu), sites=["a.com"],
            )
        )
        db.commit()
    with SessionLocal() as db:
        row = db.get(Context, (uid, "c1"))
        assert row.started_at == datetime(2026, 10, 9, 18, 25, tzinfo=timezone.utc)
        assert row.started_at.utcoffset() == timedelta(0)
        assert row.sites == ["a.com"]


def test_day_bounds_kathmandu():
    from datetime import date

    start, end = day_bounds(date(2026, 10, 10), "Asia/Kathmandu")
    assert start == datetime(2026, 10, 9, 18, 15, tzinfo=timezone.utc)
    assert end == datetime(2026, 10, 10, 18, 15, tzinfo=timezone.utc)


def test_cors_allows_exact_extension_and_dashboard_origins_only(client):
    def preflight(origin):
        return client.options(
            "/api/health",
            headers={"Origin": origin, "Access-Control-Request-Method": "PUT",
                     "Access-Control-Request-Headers": "authorization,content-type"},
        )

    for allowed in ("chrome-extension://abcdefghijklmnopabcdefghijklmnop", "https://app.focusguard.test",
                    "http://localhost:8081"):
        r = preflight(allowed)
        assert r.status_code == 200, allowed
        assert r.headers["access-control-allow-origin"] == allowed
    for denied in ("chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba", "https://evil.example"):
        r = preflight(denied)
        assert r.status_code == 400, denied
        assert "access-control-allow-origin" not in r.headers


def test_every_api_route_except_health_requires_auth(client):
    from fastapi.routing import APIRoute

    from app.main import app

    samples = {"goal_id": "33333333-3333-4333-8333-333333333333", "context_id": "ctx-1", "day": "2026-10-10"}
    checked = 0
    for route in app.routes:
        if not isinstance(route, APIRoute) or route.path == "/api/health":
            continue
        path = route.path.format(**samples)
        for method in route.methods:
            r = client.request(method, path, params={"from": "2026-10-10", "to": "2026-10-10"}, json={})
            assert r.status_code == 401, f"{method} {route.path} -> {r.status_code}"
            checked += 1
    assert checked == 12  # 4 /me + 4 /goals + 2 /contexts + 2 /daily
