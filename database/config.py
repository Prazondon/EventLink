"""
Application settings, loaded from environment variables (or a `.env` file).

Maps to NFR-SEC-01 (password hashing) and TASK-AUTH-02 (JWT issuance).
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="EVENTLINK_")

    # Database
    database_url: str = "postgresql+psycopg2://eventlink:eventlink_dev_password@localhost:5432/eventlink"

    # JWT
    jwt_secret_key: str = "CHANGE_ME_IN_PRODUCTION"  # noqa: S105 — dev default only
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    # Password reset (TASK-AUTH-04)
    password_reset_token_expire_minutes: int = 15


settings = Settings()