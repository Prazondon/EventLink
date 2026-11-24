from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from database.models import BusinessAccount, CustomerProfile, User


def get_customer_profile(db: Session, user: User) -> CustomerProfile:
    profile = (
        db.query(CustomerProfile)
        .filter(CustomerProfile.user_id == user.id)
        .one_or_none()
    )
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer profile not found.",
        )
    return profile


def get_business_account(db: Session, user: User) -> BusinessAccount:
    account = (
        db.query(BusinessAccount)
        .filter(BusinessAccount.user_id == user.id)
        .one_or_none()
    )
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Business account not found.",
        )
    return account
