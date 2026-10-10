import uuid

import pytest

from app.schemas import split_lines


def test_split_lines_trims_and_drops_empties():
    assert split_lines("  Write intro \n\n Review PR, fix CI \r\n\t\n") == ["Write intro", "Review PR, fix CI"]
    assert split_lines("\n \n") == []
    # R3: only \r\n, \r and \n split (matches the dashboard preview); \v, \f, U+2028 etc. stay inside a line.
    assert split_lines("a\vb c\fe\rd") == ["a\vb c\fe", "d"]


def test_create_single_goal_defaults(client, alice, freeze):
    freeze("2026-10-10T06:00:00+00:00")
    r = client.post("/api/goals", json={"title": "  Ship backend  "}, headers=alice)
    assert r.status_code == 201
    [goal] = r.json()
    assert goal["title"] == "Ship backend"
    assert goal["category"] == "work"
    assert goal["status"] == "open"
    assert goal["day"] == "2026-10-10"
    assert goal["sort"] == 0
    assert goal["done_at"] is None
    uuid.UUID(goal["id"])
    assert goal["created_at"].endswith("Z")


def test_create_from_lines_appends_after_existing(client, alice):
    client.post("/api/goals", json={"title": "first", "day": "2026-10-10"}, headers=alice)
    r = client.post(
        "/api/goals",
        json={"lines": "Write intro\n\n  Review PR, fix CI \n", "category": "learning", "day": "2026-10-10"},
        headers=alice,
    )
    assert r.status_code == 201
    assert [(g["title"], g["sort"], g["category"]) for g in r.json()] == [
        ("Write intro", 1, "learning"),
        ("Review PR, fix CI", 2, "learning"),
    ]
    listed = client.get("/api/goals", params={"day": "2026-10-10"}, headers=alice).json()
    assert [g["title"] for g in listed] == ["first", "Write intro", "Review PR, fix CI"]


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"title": "a", "lines": "b"},
        {"title": "   "},
        {"title": "x" * 201},
        {"lines": "\n  \n"},
        {"lines": "\n".join(f"goal {i}" for i in range(21))},
        {"lines": "ok\n" + "y" * 201},
        {"lines": "z" * 5001},
        {"title": "a", "category": "chores"},
        {"title": "a", "day": "10/10/2026"},
        {"title": "a", "user_id": "22222222-2222-4222-8222-222222222222"},
    ],
)
def test_create_validation(client, alice, body):
    assert client.post("/api/goals", json=body, headers=alice).status_code == 422


def test_twenty_lines_is_allowed(client, alice):
    r = client.post("/api/goals", json={"lines": "\n".join(f"goal {i}" for i in range(20))}, headers=alice)
    assert r.status_code == 201
    assert len(r.json()) == 20


def test_patch_status_sets_and_clears_done_at(client, alice):
    [goal] = client.post("/api/goals", json={"title": "a"}, headers=alice).json()
    done = client.patch(f"/api/goals/{goal['id']}", json={"status": "done"}, headers=alice).json()
    assert done["status"] == "done" and done["done_at"].endswith("Z")
    reopened = client.patch(f"/api/goals/{goal['id']}", json={"status": "open"}, headers=alice).json()
    assert reopened["status"] == "open" and reopened["done_at"] is None


def test_patch_title_sort_category(client, alice):
    [goal] = client.post("/api/goals", json={"title": "a"}, headers=alice).json()
    r = client.patch(f"/api/goals/{goal['id']}", json={"title": "b", "sort": 5, "category": "personal"}, headers=alice)
    assert r.status_code == 200
    assert (r.json()["title"], r.json()["sort"], r.json()["category"]) == ("b", 5, "personal")
    for bad in ({"sort": -1}, {"status": "archived"}, {"title": ""}, {"day": "2026-10-11"}):
        assert client.patch(f"/api/goals/{goal['id']}", json=bad, headers=alice).status_code == 422


def test_delete_goal(client, alice):
    [goal] = client.post("/api/goals", json={"title": "a", "day": "2026-10-10"}, headers=alice).json()
    assert client.delete(f"/api/goals/{goal['id']}", headers=alice).status_code == 204
    assert client.get("/api/goals", params={"day": "2026-10-10"}, headers=alice).json() == []
    assert client.delete(f"/api/goals/{goal['id']}", headers=alice).status_code == 404


def test_today_is_the_profile_local_day(client, alice, freeze):
    # 18:25 UTC on the 9th is 00:10 on the 10th in Asia/Kathmandu (UTC+5:45), the default tz.
    freeze("2026-10-09T18:25:00+00:00")
    [goal] = client.post("/api/goals", json={"title": "after midnight"}, headers=alice).json()
    assert goal["day"] == "2026-10-10"
    assert [g["title"] for g in client.get("/api/goals", headers=alice).json()] == ["after midnight"]
    # The same instant is still the 9th for a user in UTC.
    client.patch("/api/me", json={"tz": "UTC"}, headers=alice)
    assert client.get("/api/goals", headers=alice).json() == []
    assert client.post("/api/goals", json={"title": "utc"}, headers=alice).json()[0]["day"] == "2026-10-09"


def test_two_user_isolation(client, alice, bob):
    [goal] = client.post("/api/goals", json={"title": "alice only", "day": "2026-10-10"}, headers=alice).json()
    assert client.get("/api/goals", params={"day": "2026-10-10"}, headers=bob).json() == []
    assert client.patch(f"/api/goals/{goal['id']}", json={"title": "pwned"}, headers=bob).status_code == 404
    assert client.delete(f"/api/goals/{goal['id']}", headers=bob).status_code == 404
    assert client.patch(f"/api/goals/{uuid.uuid4()}", json={"title": "x"}, headers=alice).status_code == 404
    assert client.patch("/api/goals/not-a-uuid", json={"title": "x"}, headers=alice).status_code == 404
    assert client.delete("/api/goals/not-a-uuid", headers=alice).status_code == 404
    [still] = client.get("/api/goals", params={"day": "2026-10-10"}, headers=alice).json()
    assert still["title"] == "alice only"
