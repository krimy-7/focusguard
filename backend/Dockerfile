# Not built or tested here (no Docker daemon on the dev box). Cloud Run deploy is Phase 5 (spec section 10).
FROM python:3.10-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY alembic.ini ./
COPY migrations ./migrations
COPY app ./app

RUN useradd --create-home appuser
USER appuser

# Run `alembic upgrade head` as a one-off job (same image) before rollout.
# Keep Cloud Run --max-instances=1: the in-process rate limiter assumes a single instance.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
