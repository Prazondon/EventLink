"""
Auth service layer — TASK-AUTH-01/02/04.

Kept separate from the API routes so the same logic is reusable from a CLI,
a background job, or tests, without spinning up FastAPI.
"""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from .security import (
    TokenType,
    create_access_token,
    create_password_reset_token,
    decode_token,
    hash_password,
    verify_password,
)
from .models import BusinessAccount, CustomerProfile, User, UserRole
from .schemas import (
    BusinessRegisterRequest,
    CustomerRegisterRequest,
    TokenResponse,
)


class EmailAlreadyRegisteredError(Exception):
    pass


class InvalidCredentialsError(Exception):
    pass


class InactiveAccountError(Exception):
    pass


class InvalidResetTokenError(Exception):
    pass


class UserNotFoundError(Exception):
    pass


def _get_user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email).one_or_none()


# ---------------------------------------------------------------------------
# FR-AUTH-01 — customer registration
# ---------------------------------------------------------------------------

def register_customer(db: Session, payload: CustomerRegisterRequest) -> User:
    if _get_user_by_email(db, payload.email) is not None:
        raise EmailAlreadyRegisteredError(f"{payload.email} is already registered.")

    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=UserRole.CUSTOMER,
    )
    db.add(user)
    db.flush()  # populate user.id without committing yet

    profile = CustomerProfile(user_id=user.id, full_name=payload.full_name)
    db.add(profile)
    db.commit()
    db.refresh(user)
    return user


# ---------------------------------------------------------------------------
# FR-AUTH-02 — business registration
# ---------------------------------------------------------------------------

def register_business(db: Session, payload: BusinessRegisterRequest) -> User:
    if _get_user_by_email(db, payload.email) is not None:
        raise EmailAlreadyRegisteredError(f"{payload.email} is already registered.")

    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=UserRole.BUSINESS,
    )
    db.add(user)
    db.flush()

    account = BusinessAccount(
        user_id=user.id,
        business_name=payload.business_name,
        contact_phone=payload.contact_phone,
        contact_email=payload.email,
        location_city=payload.location_city,
        location_country=payload.location_country,
    )
    db.add(account)
    # Category linkage happens on BusinessProfile creation (§3.2, a separate
    # module) — a business account can exist before its public profile does.
    db.commit()
    db.refresh(user)
    return user


# ---------------------------------------------------------------------------
# FR-AUTH-03 — login
# ---------------------------------------------------------------------------

def authenticate(db: Session, email: str, password: str) -> TokenResponse:
    user = _get_user_by_email(db, email)
    # Constant-shape response whether the email exists or the password is
    # wrong — don't let response differences leak which emails are registered.
    if user is None or not verify_password(password, user.password_hash):
        raise InvalidCredentialsError("Incorrect email or password.")
    if not user.is_active:
        raise InactiveAccountError("This account has been deactivated.")

    token = create_access_token(subject=user.id, role=user.role.value)
    return TokenResponse(access_token=token, role=user.role.value, user_id=str(user.id))


# ---------------------------------------------------------------------------
# FR-AUTH-04 — password reset
# ---------------------------------------------------------------------------

def request_password_reset(db: Session, email: str) -> str | None:
    """Returns a reset token if the email is registered, else None.

    The caller (API route) must return the same response either way, and
    send the token by email out-of-band — never in the HTTP response body —
    except in local/dev mode. See TASK-AUTH-04: "mock/log a reset email".
    """
    user = _get_user_by_email(db, email)
    if user is None:
        return None
    return create_password_reset_token(subject=user.id)


def confirm_password_reset(db: Session, reset_token: str, new_password: str) -> None:
    try:
        payload = decode_token(reset_token, expected_type=TokenType.PASSWORD_RESET)
    except ValueError as exc:
        raise InvalidResetTokenError(str(exc)) from exc

    user_id = uuid.UUID(payload["sub"])
    user = db.get(User, user_id)
    if user is None:
        raise UserNotFoundError("The account for this reset token no longer exists.")

    user.password_hash = hash_password(new_password)
    db.add(user)
    db.commit()