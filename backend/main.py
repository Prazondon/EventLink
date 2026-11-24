"""EventLink API entrypoint. Run with: ``uvicorn backend.main:app --reload``."""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from .routers import admin, auth, business, catalog, customer
from .config import settings
from database.database import engine

app = FastAPI(title="EventLink API", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in settings.cors_origins.split(",")
        if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in (
    auth.router,
    business.router,
    catalog.router,
    customer.router,
    admin.router,
):
    app.include_router(router)


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "EventLink API is running"}


@app.get("/health")
def health() -> dict:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail="Database is unavailable.",
        ) from exc
    return {"status": "ok", "database": "ok"}