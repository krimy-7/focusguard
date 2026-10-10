from datetime import date, timedelta

import pytest


def totals(day="2026-10-10", device_id="dev-1", **overrides):
    body = {
        "day": day,
        "device_id": device_id,
        "focus_s": 3600,
        "nudges": 2,
        "self_returns": 3,
        "recoveries": 1,
        "snoozes": 0,
        "breaks": 1,
        "longest_detour_s": 240,
    }
    return {**body, **overrides}


def test_put_is_idempotent_and_absolute(client, alice):
    first = client.put("/api/daily/2026-10-10", json=totals(), headers=alice)
    again = client.put("/api/daily/2026-10-10", json=totals(), headers=alice)
    assert first.status_code == again.status_code == 200
    assert first.json() == again.json() == totals()
    client.put("/api/daily/2026-10-10", json=totals(focus_s=4000), headers=alice)
    [day] = client.get("/api/daily", params={"from": "2026-10-10", "to": "2026-10-10"}, headers=alice).json()
    assert day["focus_s"] == 4000  # replaced, never added


@pytest.mark.parametrize(
    "body",
    [
        totals(day="2026-10-11"),
        {k: v for k, v in totals().items() if k != "device_id"},
        totals(focus_s=-1),
        totals(nudges=100_001),
        totals(focus_s=90_001),
        totals(device_id="dev/1"),
        totals(extra_field=1),
    ],
)
def test_put_validation(client, alice, body):
    assert client.put("/api/daily/2026-10-10", json=body, headers=alice).status_code == 422


def test_get_sums_across_devices(client, alice):
    client.put("/api/daily/2026-10-10", json=totals(device_id="laptop"), headers=alice)
    client.put("/api/daily/2026-10-10", json=totals(device_id="desktop", focus_s=600, longest_detour_s=900), headers=alice)
    client.put("/api/daily/2026-10-08", json=totals(day="2026-10-08"), headers=alice)
    r = client.get("/api/daily", params={"from": "2026-10-08", "to": "2026-10-10"}, headers=alice)
    assert r.status_code == 200
    assert r.json() == [
        {k: v for k, v in totals(day="2026-10-08").items() if k != "device_id"},
        {"day": "2026-10-10", "focus_s": 4200, "nudges": 4, "self_returns": 6, "recoveries": 2, "snoozes": 0,
         "breaks": 2, "longest_detour_s": 900},
    ]


def test_get_sum_may_exceed_per_device_cap(client, alice):
    for dev in ("laptop", "desktop"):
        client.put("/api/daily/2026-10-10", json=totals(device_id=dev, focus_s=50_000), headers=alice)
    [day] = client.get("/api/daily", params={"from": "2026-10-10", "to": "2026-10-10"}, headers=alice).json()
    assert day["focus_s"] == 100_000  # not a 500 from response validation


def test_range_limits(client, alice):
    start = date(2026, 10, 1)
    ok = client.get("/api/daily", params={"from": str(start), "to": str(start + timedelta(days=30))}, headers=alice)
    assert ok.status_code == 200
    too_long = client.get("/api/daily", params={"from": str(start), "to": str(start + timedelta(days=31))}, headers=alice)
    assert too_long.status_code == 422
    backwards = client.get("/api/daily", params={"from": "2026-10-10", "to": "2026-10-09"}, headers=alice)
    assert backwards.status_code == 422
    assert client.get("/api/daily", params={"from": "2026-10-10"}, headers=alice).status_code == 422


def test_two_user_isolation(client, alice, bob):
    client.put("/api/daily/2026-10-10", json=totals(), headers=alice)
    assert client.get("/api/daily", params={"from": "2026-10-10", "to": "2026-10-10"}, headers=bob).json() == []
    client.put("/api/daily/2026-10-10", json=totals(focus_s=1), headers=bob)  # same day + device id
    [mine] = client.get("/api/daily", params={"from": "2026-10-10", "to": "2026-10-10"}, headers=alice).json()
    assert mine["focus_s"] == 3600
