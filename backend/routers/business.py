from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..api_schemas import (
    BusinessDashboard,
    BusinessProfileCreateRequest,
    PortfolioImageCreateRequest,
    ServiceCreateRequest,
)
from ..api_utils import get_business_account
from database.database import get_db
from ..deps import require_role
from database.models import (
    BusinessProfile,
    Category,
    InteractionLog,
    InteractionType,
    PortfolioImage,
    Review,
    Service,
    User,
    UserRole,
    VerificationStatus,
)
from ..schemas import (
    BusinessAccountRead,
    BusinessAccountUpdate,
    BusinessProfileRead,
    BusinessProfileUpdate,
    PortfolioImageRead,
    ServiceRead,
    ServiceUpdate,
)

router = APIRouter(prefix="/business/me", tags=["business management"])
business_user = require_role(UserRole.BUSINESS)


def _get_profile(db: Session, account_id: uuid.UUID) -> BusinessProfile:
    profile = (
        db.query(BusinessProfile)
        .filter(BusinessProfile.business_account_id == account_id)
        .one_or_none()
    )
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Business profile not found.")
    return profile


def _categories_for_ids(db: Session, category_ids: list[uuid.UUID]) -> list[Category]:
    categories = (
        db.query(Category)
        .filter(Category.id.in_(set(category_ids)))
        .all()
        if category_ids
        else []
    )
    if len(categories) != len(set(category_ids)):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "One or more categories do not exist.")
    return categories


@router.get("/dashboard", response_model=BusinessDashboard)
def business_dashboard(
    db: Session = Depends(get_db),
    user: User = Depends(business_user),
) -> BusinessDashboard:
    account = get_business_account(db, user)
    profile = (
        db.query(BusinessProfile)
        .filter(BusinessProfile.business_account_id == account.id)
        .one_or_none()
    )
    since = datetime.now(timezone.utc) - timedelta(days=30)
    average_rating, review_count = (
        db.query(func.coalesce(func.avg(Review.rating), 0), func.count(Review.id))
        .filter(Review.business_id == account.id)
        .one()
    )
    counts = dict(
        db.query(InteractionLog.interaction_type, func.count(InteractionLog.id))
        .filter(
            InteractionLog.business_id == account.id,
            InteractionLog.created_at >= since,
        )
        .group_by(InteractionLog.interaction_type)
        .all()
    )
    return BusinessDashboard(
        business_id=account.id,
        review_count=int(review_count),
        average_rating=float(average_rating),
        views_30_days=counts.get(InteractionType.VIEW, 0),
        contacts_30_days=counts.get(InteractionType.CONTACT, 0),
        saves_30_days=counts.get(InteractionType.SAVE, 0),
        verification_status=profile.verification_status if profile else None,
    )


@router.get("/account", response_model=BusinessAccountRead)
def read_business_account(
    db: Session = Depends(get_db),
    user: User = Depends(business_user),
) -> BusinessAccountRead:
    return BusinessAccountRead.model_validate(get_business_account(db, user))


@router.patch("/account", response_model=BusinessAccountRead)
def update_business_account(
    payload: BusinessAccountUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(business_user),
) -> BusinessAccountRead:
    account = get_business_account(db, user)
    updates = payload.model_dump(exclude_unset=True)
    if "business_name" in updates and updates["business_name"] is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "business_name cannot be null.",
        )
    if "business_name" in updates:
        updates["business_name"] = updates["business_name"].strip()
        if not updates["business_name"]:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "business_name cannot be empty.",
            )
    for field, value in updates.items():
        setattr(account, field, value)
    db.commit()
    db.refresh(account)
    return BusinessAccountRead.model_validate(account)


@router.get("/profile", response_model=BusinessProfileRead)
def read_business_profile(
    db: Session = Depends(get_db),
    user: User = Depends(business_user),
) -> BusinessProfileRead:
    account = get_business_account(db, user)
    return BusinessProfileRead.model_validate(_get_profile(db, account.id))


@router.post(
    "/profile",
    response_model=BusinessProfileRead,
    status_code=status.HTTP_201_CREATED,
)
def create_business_profile(
    payload: BusinessProfileCreateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(business_user),
) -> BusinessProfileRead:
    account = get_business_account(db, user)
    existing = (
        db.query(BusinessProfile)
        .filter(BusinessProfile.business_account_id == account.id)
        .one_or_none()
    )
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Business profile already exists.")

    profile = BusinessProfile(
        business_account_id=account.id,
        description=payload.description.strip() if payload.description else payload.description,
        categories=_categories_for_ids(db, payload.category_ids),
    )
    db.add(profile)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Business profile already exists.",
        ) from exc
    db.refresh(profile)
    return BusinessProfileRead.model_validate(profile)


@router.patch("/profile", response_model=BusinessProfileRead)
def update_business_profile(
    payload: BusinessProfileUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(business_user),
) -> BusinessProfileRead:
    account = get_business_account(db, user)
    profile = _get_profile(db, account.id)
    updates = payload.model_dump(exclude_unset=True)
    if "is_published" in updates and updates["is_published"] is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "is_published cannot be null.",
        )
    category_ids = updates.pop("category_ids", None)
    if updates.get("description") is not None:
        updates["description"] = updates["description"].strip()
    if updates.get("is_published") is True and profile.verification_status != VerificationStatus.APPROVED:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "A business profile must be approved before it can be published.",
        )
    for field, value in updates.items():
        setattr(profile, field, value)
    if category_ids is not None:
        profile.categories = _categories_for_ids(db, category_ids)
    db.commit()
    db.refresh(profile)
    return BusinessProfileRead.model_validate(profile)


@router.get("/profile/services", response_model=list[ServiceRead])
def list_services(
    db: Session = Depends(get_db),
    user: User = Depends(business_user),
) -> list[ServiceRead]:
    account = get_business_account(db, user)
    profile = _get_profile(db, account.id)
    return [ServiceRead.model_validate(item) for item in profile.services]


@router.post(
    "/profile/services",
    response_model=ServiceRead,
    status_code=status.HTTP_201_CREATED,
)
def create_service(
    payload: ServiceCreateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(business_user),
) -> ServiceRead:
    account = get_business_account(db, user)
    profile = _get_profile(db, account.id)
    name = payload.name.strip()
    if not name:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Service name cannot be empty.",
        )
    service = Service(
        business_profile_id=profile.id,
        **payload.model_dump(),
    )
    service.name = name
    db.add(service)
    db.commit()
    db.refresh(service)
    return ServiceRead.model_validate(service)


@router.patch("/profile/services/{service_id}", response_model=ServiceRead)
def update_service(
    service_id: uuid.UUID,
    payload: ServiceUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(business_user),
) -> ServiceRead:
    account = get_business_account(db, user)
    profile = _get_profile(db, account.id)
    service = (
        db.query(Service)
        .filter(Service.id == service_id, Service.business_profile_id == profile.id)
        .one_or_none()
    )
    if service is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found.")
    updates = payload.model_dump(exclude_unset=True)
    if any(updates.get(field, False) is None for field in ("name", "currency") if field in updates):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Service name and currency cannot be null.",
        )
    if "name" in updates:
        updates["name"] = updates["name"].strip()
        if not updates["name"]:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "Service name cannot be empty.",
            )
    for field, value in updates.items():
        setattr(service, field, value)
    db.commit()
    db.refresh(service)
    return ServiceRead.model_validate(service)


@router.delete("/profile/services/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_service(
    service_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(business_user),
) -> Response:
    account = get_business_account(db, user)
    profile = _get_profile(db, account.id)
    service = (
        db.query(Service)
        .filter(Service.id == service_id, Service.business_profile_id == profile.id)
        .one_or_none()
    )
    if service is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found.")
    db.delete(service)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/profile/portfolio", response_model=list[PortfolioImageRead])
def list_portfolio(
    db: Session = Depends(get_db),
    user: User = Depends(business_user),
) -> list[PortfolioImageRead]:
    account = get_business_account(db, user)
    profile = _get_profile(db, account.id)
    return [PortfolioImageRead.model_validate(item) for item in profile.portfolio_images]


@router.post(
    "/profile/portfolio",
    response_model=PortfolioImageRead,
    status_code=status.HTTP_201_CREATED,
)
def add_portfolio_image(
    payload: PortfolioImageCreateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(business_user),
) -> PortfolioImageRead:
    account = get_business_account(db, user)
    profile = _get_profile(db, account.id)
    image = PortfolioImage(
        business_profile_id=profile.id,
        image_url=str(payload.image_url),
        caption=payload.caption,
        display_order=payload.display_order,
    )
    db.add(image)
    db.commit()
    db.refresh(image)
    return PortfolioImageRead.model_validate(image)


@router.delete("/profile/portfolio/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_portfolio_image(
    image_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(business_user),
) -> Response:
    account = get_business_account(db, user)
    profile = _get_profile(db, account.id)
    image = (
        db.query(PortfolioImage)
        .filter(
            PortfolioImage.id == image_id,
            PortfolioImage.business_profile_id == profile.id,
        )
        .one_or_none()
    )
    if image is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Portfolio image not found.")
    db.delete(image)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
