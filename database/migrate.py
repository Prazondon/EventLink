from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from .database import engine
from .models import Base


def main() -> None:
    config = Config(str(Path(__file__).with_name("alembic.ini")))
    existing_tables = set(inspect(engine).get_table_names())
    expected_tables = set(Base.metadata.tables)
    if "alembic_version" not in existing_tables and existing_tables:
        missing_tables = expected_tables - existing_tables
        if missing_tables:
            missing = ", ".join(sorted(missing_tables))
            raise RuntimeError(
                "The database has an unversioned partial schema. "
                f"Missing expected tables: {missing}. Back up and repair it before migrating."
            )
        command.stamp(config, "7f64e34fd362")
    command.upgrade(config, "head")


if __name__ == "__main__":
    main()
