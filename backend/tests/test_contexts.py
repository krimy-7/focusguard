import pytest


def snap(**overrides):
    body = {
        "id": "ctx-1",
        "device_id": "dev-1",
        "title": "Thesis chapter 2",
        "mode": "work",
        "state": "active",
        "confidence": "confirmed",
        "started_at": "2026-10-10T03:00:00Z",
        "ended_at": None,
        "last_active_at": "2026-10-10T04:00:00Z",
        "sites": ["docs.google.com", "scholar.google.com"],
    }
    return {**body, **overrides}


def test_put_is_an_idempotent_upsert(client, alice):
    first = client.put("/api/contexts/ctx-1", json=snap(), headers=alice)
    second = client.put("/api/contexts/ctx-1", json=snap(), headers=alice)
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json() == snap()
    assert len(client.get("/api/contexts", params={"day": "2026-10-10"}, headers=alice).json()) == 1


def test_put_updates_with_newer_snapshot_and_ignores_stale_replay(client, alice):
    client.put("/api/contexts/ctx-1", json=snap(), headers=alice)
    newer = snap(state="grace", last_active_at="2026-10-10T05:00:00Z", sites=["docs.google.com"])
    assert client.put("/api/contexts/ctx-1", json=newer, headers=alice).json()["state"] == "grace"
    stale = client.put("/api/contexts/ctx-1", json=snap(state="active"), headers=alice)
    assert stale.status_code == 200
    assert stale.json() == newer


def test_sites_are_normalised_hostnames(client, alice):
    sites = [" Docs.Google.COM ", "xn--bcher-kva.example", "[::1]", "my_app.example.com", "127.0.0.1"]
    r = client.put("/api/contexts/ctx-1", json=snap(sites=sites), headers=alice)
    assert r.json()["sites"] == ["docs.google.com", "xn--bcher-kva.example", "[::1]", "my_app.example.com", "127.0.0.1"]


@pytest.mark.parametrize(
    "overrides",
    [
        {"id": "other"},
        {"sites": ["https://docs.google.com/document/d/abc"]},
        {"sites": ["docs.google.com/path"]},
        {"sites": ["localhost:8080"]},
        {"sites": ["[::1]:80"]},
        {"sites": ["two words.com"]},
        {"sites": [f"s{i}.example.com" for i in range(51)]},
        {"title": "t" * 121},
        {"title": ""},
        {"state": "drifting"},
        {"mode": "fun"},
        {"confidence": "maybe"},
        {"started_at": "2026-10-10T03:00:00"},
        {"page_title": "My bank statement - Inbox"},
        {"device_id": "dev 1"},
    ],
)
def test_put_validation(client, alice, overrides):
    assert client.put("/api/contexts/ctx-1", json=snap(**overrides), headers=alice).status_code == 422


def test_fifty_sites_is_allowed(client, alice):
    sites = [f"s{i}.example.com" for i in range(50)]
    assert client.put("/api/contexts/ctx-1", json=snap(sites=sites), headers=alice).status_code == 200


def test_bad_path_id_is_422(client, alice):
    assert client.put("/api/contexts/bad id!", json=snap(id="bad id!"), headers=alice).status_code == 422


def test_active_returns_latest_non_ended(client, alice, freeze):
    freeze("2026-10-10T05:10:00+00:00")  # b (05:00Z) is fresh under R6's 30-min rule
    assert client.get("/api/contexts", params={"active": 1}, headers=alice).json() == []
    client.put("/api/contexts/a", json=snap(id="a", last_active_at="2026-10-10T04:00:00Z"), headers=alice)
    client.put("/api/contexts/b", json=snap(id="b", last_active_at="2026-10-10T05:00:00Z"), headers=alice)
    client.put(
        "/api/contexts/c",
        json=snap(id="c", state="ended", ended_at="2026-10-10T06:00:00Z", last_active_at="2026-10-10T06:00:00Z"),
        headers=alice,
    )
    assert [c["id"] for c in client.get("/api/contexts", params={"active": 1}, headers=alice).json()] == ["b"]
    freeze("2026-10-10T05:31:00+00:00")  # b is now 31 min old: [] (no fallback to older a, never ended c)
    assert client.get("/api/contexts", params={"active": 1}, headers=alice).json() == []


def test_active_hides_stale_context(client, alice, freeze):
    # R6: a context the extension never ended (uninstall, crash) stops being "current" after 30 min.
    client.put("/api/contexts/ctx-1", json=snap(last_active_at="2026-10-10T04:00:00Z"), headers=alice)
    freeze("2026-10-10T04:30:00+00:00")  # exactly 30 min: still current
    assert [c["id"] for c in client.get("/api/contexts", params={"active": 1}, headers=alice).json()] == ["ctx-1"]
    freeze("2026-10-10T04:31:00+00:00")
    assert client.get("/api/contexts", params={"active": 1}, headers=alice).json() == []


def test_day_filter_uses_local_day_bounds(client, alice):
    # Asia/Kathmandu (default tz) is UTC+5:45, so local 2026-10-10 is [10-09T18:15Z, 10-10T18:15Z).
    def put(cid, start, last, ended=None):
        body = snap(id=cid, started_at=start, last_active_at=last, ended_at=ended, state="ended" if ended else "active")
        assert client.put(f"/api/contexts/{cid}", json=body, headers=alice).status_code == 200

    put("before-midnight", "2026-10-09T17:00:00Z", "2026-10-09T18:00:00Z", "2026-10-09T18:00:00Z")
    put("just-after-midnight", "2026-10-09T18:20:00Z", "2026-10-09T19:00:00Z", "2026-10-09T19:00:00Z")
    put("spans-midnight", "2026-10-09T18:00:00Z", "2026-10-09T18:30:00Z", "2026-10-09T18:30:00Z")
    put("abandoned-last-week", "2026-10-02T10:00:00Z", "2026-10-02T11:00:00Z")
    put("tomorrow", "2026-10-10T18:15:00Z", "2026-10-10T19:00:00Z")

    day10 = client.get("/api/contexts", params={"day": "2026-10-10"}, headers=alice).json()
    assert [c["id"] for c in day10] == ["spans-midnight", "just-after-midnight"]
    day9 = client.get("/api/contexts", params={"day": "2026-10-09"}, headers=alice).json()
    assert [c["id"] for c in day9] == ["before-midnight", "spans-midnight"]


def test_default_day_is_today_in_profile_tz(client, alice, freeze):
    freeze("2026-10-09T18:25:00+00:00")  # 00:10 on the 10th in Kathmandu
    client.put("/api/contexts/ctx-1", json=snap(started_at="2026-10-09T18:20:00Z", last_active_at="2026-10-09T18:24:00Z"),
               headers=alice)
    assert [c["id"] for c in client.get("/api/contexts", headers=alice).json()] == ["ctx-1"]


def test_two_user_isolation(client, alice, bob, freeze):
    freeze("2026-10-10T04:10:00+00:00")  # snap() last_active_at is 04:00Z: fresh for ?active=1
    client.put("/api/contexts/ctx-1", json=snap(), headers=alice)
    assert client.get("/api/contexts", params={"day": "2026-10-10"}, headers=bob).json() == []
    assert client.get("/api/contexts", params={"active": 1}, headers=bob).json() == []
    # Bob reusing Alice's id gets his own row; Alice's is untouched.
    assert client.put("/api/contexts/ctx-1", json=snap(title="Bob's"), headers=bob).json()["title"] == "Bob's"
    [mine] = client.get("/api/contexts", params={"active": 1}, headers=alice).json()
    assert mine["title"] == "Thesis chapter 2"
