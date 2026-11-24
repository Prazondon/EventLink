from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..api_schemas import VerificationDecision, VerificationQueueItem, VerificationSubmission
from ..api_utils import get_business_account
from database.database import get_db
from ..deps import require_role
from database.models import (
    BusinessAccount,
    BusinessProfile,
    User,
    UserRole,
    VerificationRecord,
    VerificationStatus,
)
from ..schemas import MessageResponse

router = APIRouter(tags=["verification and administration"])
admin_user = require_role(UserRole.ADMIN)
business_user = require_role(UserRole.BUSINESS)


@router.post(
    "/business/me/verification",
    status_code=status.HTTP_201_CREATED,
)
def request_business_verification(
    payload: VerificationSubmission,
    db: Session = Depends(get_db),
    user: User = Depends(business_user),
) -> dict[str, str]:
    account = get_business_account(db, user)
    profile = (
        db.query(BusinessProfile)
        .filter(BusinessProfile.business_account_id == account.id)
        .one_or_none()
    )
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Business profile not found.")
    if profile.verification_status == VerificationStatus.APPROVED:
        raise HTTPException(status.HTTP_409_CONFLICT, "This business is already verified.")
    pending = (
        db.query(VerificationRecord)
        .filter(
            VerificationRecord.business_id == account.id,
            VerificationRecord.status == VerificationStatus.PENDING,
        )
        .first()
    )
    if pending is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "A verification request is already pending.")

    record = VerificationRecord(
        business_id=account.id,
        status=VerificationStatus.PENDING,
        decision_reason=payload.decision_reason,
    )
    profile.verification_status = VerificationStatus.PENDING
    profile.is_published = False
    db.add(record)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "A verification request is already pending.",
        ) from exc
    return {"message": "Verification request submitted."}


@router.get(
    "/admin/verifications",
    response_model=list[VerificationQueueItem],
    dependencies=[Depends(admin_user)],
)
def list_verification_requests(
    status_filter: VerificationStatus = Query(default=VerificationStatus.PENDING, alias="status"),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> list[VerificationQueueItem]:
    rows = (
        db.query(VerificationRecord, BusinessAccount)
        .join(
            BusinessAccount,
            BusinessAccount.id == VerificationRecord.business_id,
        )
        .filter(VerificationRecord.status == status_filter)
        .order_by(VerificationRecord.created_at, VerificationRecord.id)
        .offset(offset)
        .limit(limit)
        .all()
    )
    result: list[VerificationQueueItem] = []
    for record, account in rows:
        result.append(
            VerificationQueueItem(
                record_id=record.id,
                business_id=account.id,
                business_name=account.business_name,
                contact_email=account.contact_email,
                created_at=record.created_at,
            )
        )
    return result


@router.post(
    "/admin/verifications/{record_id}/decision",
    response_model=MessageResponse,
)
def decide_verification(
    record_id: uuid.UUID,
    payload: VerificationDecision,
    db: Session = Depends(get_db),
    admin: User = Depends(admin_user),
) -> MessageResponse:
    if payload.status == VerificationStatus.PENDING:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "A verification decision must be approved or rejected.",
        )
    record = db.get(VerificationRecord, record_id)
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Verification request not found.")
    if record.status != VerificationStatus.PENDING:
        raise HTTPException(status.HTTP_409_CONFLICT, "This request has already been decided.")
    profile = (
        db.query(BusinessProfile)
        .filter(BusinessProfile.business_account_id == record.business_id)
        .one_or_none()
    )
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Business profile not found.")
    record.status = payload.status
    record.reviewer_id = admin.id
    record.decision_reason = payload.decision_reason
    profile.verification_status = payload.status
    if payload.status == VerificationStatus.REJECTED:
        profile.is_published = False
    else:
        account = record.business
        account.user.is_verified = True
    db.commit()
    return MessageResponse(message=f"Business verification {payload.status.value}.")
