from alembic import context
from sqlalchemy import create_engine

import app.models  # noqa: F401  (registers the tables on Base.metadata)
from app.config import get_settings
from app.database import Base, db_url

# ponytail: online mode only; add offline (--sql) mode if someone ever needs raw SQL scripts.
connectable = create_engine(db_url(get_settings().database_url))
with connectable.connect() as connection:
    context.configure(connection=connection, target_metadata=Base.metadata, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()
connectable.dispose()
