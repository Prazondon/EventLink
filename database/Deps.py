"""
FastAPI dependencies: current-user resolution + RBAC (TASK-AUTH-03, FR-AUTH-05).

Usage on a protected route:

    @router.get("/business/dashboard")
    def dashboard(user: User = Depends(require_role(UserRole.BUSINESS))):
        ...

`require_role` accepts multiple roles for endpoints shared across roles,
e.g. `require_role(UserRole.BUSINESS, UserRole.ADMIN)`.
"""

from __future__ import annotations

import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .database import get_db
from .security import TokenType, decode_token
from .models import User, UserRole

_bearer_scheme = HTTPBearer(auto_error=True)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Resolve the bearer token to a `User` row, or raise 401."""
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(credentials.credentials, expected_type=TokenType.ACCESS)
    except ValueError as exc:
        raise unauthorized from exc

    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError) as exc:
        raise unauthorized from exc

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise unauthorized
    return user


def require_role(*allowed_roles: UserRole):
    """Dependency factory enforcing FR-AUTH-05 role-based access control.

    Distinct from `get_current_user`: that answers "who is this?", this
    answers "are they allowed here?" — kept separate so routes needing only
    identity (e.g. "get my own profile") don't have to name every role.
    """

    def _check(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This action requires one of: {', '.join(r.value for r in allowed_roles)}.",
            )
        return user

    return _check