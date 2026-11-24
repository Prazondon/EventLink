"""
Password hashing (NFR-SEC-01) and JWT access/reset tokens (TASK-AUTH-02, -04).

Uses `bcrypt` directly rather than `passlib`, whose bcrypt backend has known
compatibility breaks against bcrypt>=4.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from enum import Enum

import bcrypt
import jwt

from .config import settings

# bcrypt truncates/errors past 72 bytes; reject longer passwords explicitly
# rather than silently truncating.
_MAX_PASSWORD_BYTES = 72


class TokenType(str, Enum):
    ACCESS = "access"
    PASSWORD_RESET = "password_reset"


class PasswordTooLongError(ValueError):
    """Raised when a plaintext password exceeds bcrypt's 72-byte input limit."""


def hash_password(plain_password: str) -> str:
    encoded = plain_password.encode("utf-8")
    if len(encoded) > _MAX_PASSWORD_BYTES:
        raise PasswordTooLongError(f"Password must be at most {_MAX_PASSWORD_BYTES} bytes.")
    hashed = bcrypt.hashpw(encoded, bcrypt.gensalt())
    return hashed.decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        # Malformed hash in storage — treat as a verification failure, not a crash.
        return False


def create_access_token(*, subject: uuid.UUID, role: str) -> str:
    """Issue a short-lived JWT identifying the authenticated user (TASK-AUTH-02)."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(subject),
        "role": role,
        "type": TokenType.ACCESS.value,
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_password_reset_token(*, subject: uuid.UUID) -> str:
    """Issue a time-limited, single-purpose token for the reset-password flow (TASK-AUTH-04)."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(subject),
        "type": TokenType.PASSWORD_RESET.value,
        "iat": now,
        "exp": now + timedelta(minutes=settings.password_reset_token_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str, *, expected_type: TokenType) -> dict:
    """Decode and validate a JWT, enforcing its declared `type` matches what the
    caller expects (an access token must never be accepted where a
    password-reset token is required, and vice versa)."""
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError as exc:
        raise ValueError("Token has expired.") from exc
    except jwt.InvalidTokenError as exc:
        raise ValueError("Token is invalid.") from exc

    if payload.get("type") != expected_type.value:
        raise ValueError("Token type mismatch.")
    return payload