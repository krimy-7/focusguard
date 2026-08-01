import logging
import platform
import subprocess
import time

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import get_settings

logger = logging.getLogger("focusguard")

settings = get_settings()

DEFAULT_SQLITE_URL = "sqlite:///./focusguard.db"

# Common PostgreSQL service names, newest first. Used to start a stopped
# local server automatically when the backend boots.
POSTGRES_SERVICE_NAMES = ["postgresql-x64-18", "postgresql-18", "postgresql"]


def _engine_for(url: str):
    # Plain postgresql:// URLs default to the psycopg2 driver; route them to
    # the installed psycopg (v3) driver instead.
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://") :]
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    return create_engine(url, echo=settings.debug, connect_args=connect_args)


def _try_connect(url: str) -> bool:
    try:
        candidate = _engine_for(url)
        with candidate.connect():
            pass
        candidate.dispose()
        return True
    except Exception:
        return False


def _try_run(cmd: list[str]) -> bool:
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        return result.returncode == 0
    except Exception:
        return False


def _start_postgres_service() -> bool:
    """Best-effort start of a local PostgreSQL server across OSes."""
    system = platform.system()
    if system == "Windows":
        for name in POSTGRES_SERVICE_NAMES:
            try:
                query = subprocess.run(["sc", "query", name], capture_output=True, text=True, timeout=10)
            except Exception:
                continue
            if query.returncode != 0:  # service not installed under this name
                continue
            if "RUNNING" in query.stdout.upper():
                return True
            try:
                subprocess.run(["sc", "start", name], capture_output=True, text=True, timeout=15)
            except Exception:
                pass
            return True  # started async; caller polls the connection
        return False
    if system == "Darwin":
        return _try_run(["brew", "services", "start", "postgresql@18"]) or _try_run(
            ["brew", "services", "start", "postgresql"]
        )
    # Linux
    return (
        _try_run(["pg_ctlcluster", "18", "main", "start"])
        or _try_run(["systemctl", "start", "postgresql"])
        or _try_run(["service", "postgresql", "start"])
    )


def _ensure_database_exists(url: str) -> bool:
    """Create the configured database if it doesn't exist yet (Postgres only).
    Connects to the maintenance 'postgres' database to do so."""
    target = url.rsplit("/", 1)[-1]
    if not target or target == "postgres":
        return False
    admin_url = url[: url.rfind("/")] + "/postgres"
    try:
        engine = _engine_for(admin_url)
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
            exists = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": target}
            ).scalar()
            if not exists:
                conn.execute(text(f'CREATE DATABASE "{target}"'))
                logger.info("Created database: %s", target)
        engine.dispose()
        return True
    except Exception:
        return False


def ensure_postgres_running(url: str) -> bool:
    """Make sure a configured Postgres server is up before we connect to it.
    Starts the local service and creates the database if needed.
    Returns True when a connection succeeds."""
    if _try_connect(url):
        return True
    logger.info("Postgres not reachable — starting the local service if needed.")
    _start_postgres_service()
    for _ in range(15):  # wait up to ~15s for the service to accept connections
        if _try_connect(url):
            logger.info("Postgres is up.")
            return True
        _ensure_database_exists(url)
        time.sleep(1)
    return False


engine = _engine_for(settings.database_url or DEFAULT_SQLITE_URL)


class Base(DeclarativeBase):
    pass


SessionLocal = sessionmaker(autoflush=False, autocommit=False)


def resolve_engine():
    """Build the engine, falling back to SQLite when a configured database
    (e.g. Postgres) is unavailable or its driver is missing, so the demo never breaks.
    Starts a local Postgres server first if one is configured but stopped.
    Returns the resolved engine."""
    global engine
    url = settings.database_url or DEFAULT_SQLITE_URL
    if url.startswith("postgresql"):
        ensure_postgres_running(url)
    try:
        candidate = _engine_for(url)
        with candidate.connect():
            pass
        engine = candidate
        if url != DEFAULT_SQLITE_URL:
            logger.info("Connected to configured database: %s", url.split("@")[-1])
    except Exception as exc:
        if url != DEFAULT_SQLITE_URL:
            logger.warning("Configured database unavailable (%s) — falling back to SQLite.", exc)
        engine = _engine_for(DEFAULT_SQLITE_URL)
    return engine


def get_db():
    db = SessionLocal(bind=engine)
    try:
        yield db
    finally:
        db.close()
