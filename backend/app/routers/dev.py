from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import Base, get_db, resolve_engine
from app.models import Context
from app.services.mock import seed_database

router = APIRouter(prefix="/dev", tags=["dev"])


@router.post("/reset")
def reset_database(db: Session = Depends(get_db)):
    """Wipe all data and re-seed with the mock dataset.

    Development-only: guarded by ENABLE_DEV_ROUTES. Leaves the DB with NO active context so
    the extension starts detecting fresh from the current tab.
    """
    if not get_settings().enable_dev_routes:
        raise HTTPException(status_code=404)

    engine = resolve_engine()
    if engine.dialect.name == "postgresql":
        table_names = ", ".join(t.name for t in reversed(Base.metadata.sorted_tables))
        db.execute(text(f"TRUNCATE TABLE {table_names} RESTART IDENTITY CASCADE"))
    else:
        for table in reversed(Base.metadata.sorted_tables):
            db.execute(table.delete())
    db.commit()

    seed_database(db)
    db.query(Context).update({"active": False})
    db.commit()
    return {"status": "reset", "seeded": get_settings().demo_mode}
