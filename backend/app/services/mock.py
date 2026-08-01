from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.models import (
    Achievement,
    BreakSession,
    Context,
    ContextActivity,
    DailyGoal,
    FocusEvent,
    FocusSession,
    Milestone,
    MoodEntry,
    Task,
)

SEED_TASKS = [
    {"title": "Morning workout", "category": "must", "tag": "Personal"},
    {"title": "Check emails", "category": "must", "tag": "Work"},
    {"title": "Study the RAFT Paper", "category": "should", "tag": "Learning"},
    {"title": "Drink water", "category": "should", "tag": "Health"},
    {"title": "Validate Tokens", "category": "should", "tag": "Work"},
]

SEED_MILESTONES = [
    {"title": "First Step", "description": "Your journey began. Welcome to the FocusGuard family.", "days_ago": 14},
    {"title": "Consistency King", "description": "You maintained a 7-day streak for the first time!", "days_ago": 2},
]


def seed_database(db: Session) -> bool:
    """Insert representative mock data when the database is empty. Returns True if seeded."""
    if db.query(Task).count() > 0:
        return False

    now = datetime.utcnow()

    for item in SEED_TASKS:
        db.add(Task(title=item["title"], category=item["category"], tag=item["tag"], status="open"))

    for idx, item in enumerate(SEED_MILESTONES):
        db.add(
            Milestone(
                title=item["title"],
                description=item["description"],
                achieved=True,
                achieved_at=now - timedelta(days=item["days_ago"], hours=idx),
            )
        )

    focus_minutes = [35, 50, 42, 60, 25, 40]
    for idx, minutes in enumerate(focus_minutes):
        started = now - timedelta(days=len(focus_minutes) - idx, hours=1)
        db.add(
            FocusSession(
                task_title="Deep focus block",
                app_name="VS Code",
                started_at=started,
                ended_at=started + timedelta(minutes=minutes),
                duration_s=minutes * 60,
                score=min(100, 70 + idx * 5),
            )
        )

    db.add(FocusEvent(type="context_switch", detail="Switched to Figma", duration_s=4, occurred_at=now - timedelta(hours=2)))
    db.add(FocusEvent(type="interruption", detail="Notification ping", duration_s=45, occurred_at=now - timedelta(hours=1)))

    today = now.strftime("%Y-%m-%d")
    for idx, goal in enumerate(
        ["Finish the landing page hero", "Study React for one hour", "Prepare the presentation"]
    ):
        db.add(
            DailyGoal(
                title=goal,
                source="ai",
                day=today,
                status="in_progress" if idx == 0 else "open",
                created_at=now - timedelta(hours=3 - idx),
            )
        )

    ctx = Context(title="Landing Page Design", mode="work", source="detected", active=False, confirmed=True)
    db.add(ctx)
    db.flush()
    for domain, minutes in [("figma.com", 32), ("fonts.google.com", 6), ("photoshop.adobe.com", 11)]:
        db.add(
            ContextActivity(
                context_id=ctx.id,
                kind="domain",
                label=domain,
                domain=domain,
                duration_s=minutes * 60,
                occurred_at=now - timedelta(minutes=minutes),
            )
        )

    db.add(MoodEntry(mood="😄", note="Ready to ship", recorded_at=now - timedelta(hours=4)))

    for code, title, description in [
        ("first_focus", "First Focus", "Complete your first focus session."),
        ("first_recovery", "First Context Recovery", "Returned to your context after drifting."),
        ("deep_work", "Deep Work", "Logged a 50+ minute deep focus session."),
    ]:
        db.add(Achievement(code=code, title=title, description=description, unlocked_at=now - timedelta(days=idx or 1)))

    db.commit()
    return True
