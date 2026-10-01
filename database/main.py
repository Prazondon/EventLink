"""EventLink API entrypoint. Run with: ``uvicorn database.main:app --reload``."""

from fastapi import FastAPI

from .auth import router as auth_router
from .database import engine
from .models import Base

# For local/dev only — use Alembic migrations in production instead of
# create_all, so schema changes are tracked and reversible.
Base.metadata.create_all(bind=engine)

app = FastAPI(title="EventLink API", version="0.2.0")
app.include_router(auth_router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}