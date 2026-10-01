"""
Auth API routes — TASK-AUTH-02 and TASK-AUTH-04.

    POST /auth/register/customer
    POST /auth/register/business
    POST /auth/login
    POST /auth/password-reset/request
    POST /auth/password-reset/confirm
    POST /auth/logout

FR-AUTH-06 (logout) is handled client-side for a stateless JWT (the client
discards the token) — see the note on `/auth/logout` below for the
alternative if server-side session revocation is required.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .Deps import get_current_user
from .database import get_db
from .security import PasswordTooLongError
from .models import User
from .schemas import (
    BusinessRegisterRequest,
    CustomerRegisterRequest,
    LoginRequest,
    MessageResponse,
    PasswordResetConfirm,
    PasswordResetRequest,
    TokenResponse,
)
from .schemas import UserRead
from . import Auth_service as auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register/customer", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register_customer(payload: CustomerRegisterRequest, db: Session = Depends(get_db)) -> User:
    """FR-AUTH-01."""
    try:
        return auth_service.register_customer(db, payload)
    except auth_service.EmailAlreadyRegisteredError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except PasswordTooLongError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc


@router.post("/register/business", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register_business(payload: BusinessRegisterRequest, db: Session = Depends(get_db)) -> User:
    """FR-AUTH-02."""
    try:
        return auth_service.register_business(db, payload)
    except auth_service.EmailAlreadyRegisteredError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except PasswordTooLongError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """FR-AUTH-03. Issues a JWT carrying the user's role for RBAC (TASK-AUTH-03)."""
    try:
        return auth_service.authenticate(db, payload.email, payload.password)
    except (auth_service.InvalidCredentialsError, auth_service.InactiveAccountError) as exc:
        # Same status/detail for both — don't reveal *why* login failed.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password.") from exc


@router.post("/password-reset/request", response_model=MessageResponse)
def request_password_reset(payload: PasswordResetRequest, db: Session = Depends(get_db)) -> MessageResponse:
    """FR-AUTH-04, step 1. Always returns 200 with the same message, whether
    or not the email is registered, to avoid leaking account existence."""
    reset_token = auth_service.request_password_reset(db, payload.email)
    if reset_token is not None:
        # TASK-AUTH-04: "for the prototype, mock/log a reset email" — replace
        # this with a real email-sending call (e.g. via a mailer service) in
        # production; never log tokens in a real deployment.
        print(f"[DEV ONLY] Password reset token for {payload.email}: {reset_token}")
    return MessageResponse(message="If that email is registered, a reset link has been sent.")


@router.post("/password-reset/confirm", response_model=MessageResponse)
def confirm_password_reset(payload: PasswordResetConfirm, db: Session = Depends(get_db)) -> MessageResponse:
    """FR-AUTH-04, step 2."""
    try:
        auth_service.confirm_password_reset(db, payload.reset_token, payload.new_password)
    except auth_service.InvalidResetTokenError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except auth_service.UserNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except PasswordTooLongError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return MessageResponse(message="Password has been reset. Please log in again.")


@router.post("/logout", response_model=MessageResponse)
def logout(current_user: User = Depends(get_current_user)) -> MessageResponse:
    """FR-AUTH-06.

    JWTs here are stateless and not persisted server-side, so there is
    nothing to invalidate — the client simply discards the token. If a
    stronger guarantee is needed (immediate server-side revocation before
    natural expiry), add a `revoked_tokens` table keyed by JWT `jti` and
    check it in `get_current_user`.
    """
    return MessageResponse(message="Logged out.")