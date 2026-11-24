"""Backend application settings from environment variables or a .env file."""

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="EVENTLINK_")

    environment: str = "development"
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    jwt_secret_key: str = "CHANGE_ME_IN_PRODUCTION"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    password_reset_token_expire_minutes: int = 15
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from_email: str | None = None
    password_reset_url: str = "http://localhost:5173/reset-password"

    @model_validator(mode="after")
    def validate_production_settings(self) -> "Settings":
        if self.environment.casefold() == "production":
            if self.jwt_secret_key == "CHANGE_ME_IN_PRODUCTION" or len(self.jwt_secret_key) < 32:
                raise ValueError(
                    "Production requires an EVENTLINK_JWT_SECRET_KEY of at least 32 characters."
                )
        if self.access_token_expire_minutes <= 0:
            raise ValueError("access_token_expire_minutes must be positive.")
        if self.password_reset_token_expire_minutes <= 0:
            raise ValueError("password_reset_token_expire_minutes must be positive.")
        return self


settings = Settings()
