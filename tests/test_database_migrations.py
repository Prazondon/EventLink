from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

from database.models import Base, User, UserRole

ROOT = Path(__file__).resolve().parents[1]


def _run_migrations(database_url: str) -> None:
    _run_command(database_url, "-m", "database.migrate")


def _run_alembic(database_url: str, *arguments: str) -> None:
    _run_command(
        database_url,
        "-m",
        "alembic",
        "-c",
        "database/alembic.ini",
        *arguments,
    )


def _run_command(database_url: str, *command: str) -> None:
    environment = os.environ.copy()
    environment["EVENTLINK_DATABASE_URL"] = database_url
    environment["EVENTLINK_ENVIRONMENT"] = "test"
    environment["EVENTLINK_JWT_SECRET_KEY"] = "test-only-signing-key-that-is-long-enough"
    subprocess.run(
        [sys.executable, *command],
        cwd=ROOT,
        env=environment,
        check=True,
        capture_output=True,
        text=True,
    )


def test_fresh_database_migrates_and_is_repeatable(tmp_path):
    database_path = tmp_path / "fresh.sqlite"
    database_url = f"sqlite:///{database_path.as_posix()}"

    _run_migrations(database_url)
    _run_migrations(database_url)
    _run_alembic(database_url, "downgrade", "-1")
    _run_alembic(database_url, "upgrade", "head")

    engine = create_engine(database_url)
    tables = set(inspect(engine).get_table_names())
    assert set(Base.metadata.tables).issubset(tables)
    with engine.connect() as connection:
        revision = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
    assert revision == "9215d2bb396c"
    with engine.connect() as connection:
        index_names = set(
            connection.execute(
                text("SELECT name FROM sqlite_master WHERE type = 'index'")
            ).scalars()
        )
    assert {
        "uq_users_email_lower",
        "uq_categories_name_lower",
        "uq_verification_records_pending_business",
    }.issubset(index_names)
    engine.dispose()


def test_existing_create_all_database_is_stamped_without_losing_rows(tmp_path):
    database_path = tmp_path / "existing.sqlite"
    database_url = f"sqlite:///{database_path.as_posix()}"
    engine = create_engine(database_url)
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        connection.execute(text("DROP INDEX uq_users_email_lower"))
        connection.execute(text("DROP INDEX uq_categories_name_lower"))
        connection.execute(text("DROP INDEX uq_verification_records_pending_business"))
    with Session(engine) as db:
        db.add(
            User(
                email="legacy@example.com",
                password_hash="already-hashed",
                role=UserRole.CUSTOMER,
            )
        )
        db.commit()
    engine.dispose()

    _run_migrations(database_url)

    engine = create_engine(database_url)
    with engine.connect() as connection:
        email = connection.execute(text("SELECT email FROM users")).scalar_one()
        revision = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
    assert email == "legacy@example.com"
    assert revision == "9215d2bb396c"
    engine.dispose()
