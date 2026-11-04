"""Database connection settings, loaded from EVENTLINK_* environment variables."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class DatabaseSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="EVENTLINK_")

    database_url: str = (
        "postgresql+psycopg2://eventlink:eventlink_dev_password@localhost:5432/eventlink"
    )


settings = DatabaseSettings()
