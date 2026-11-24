from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..api_schemas import (
    CustomerDashboard,
    CustomerProfilePatch,
    InteractionSubmission,
    PublicBusinessRead,
    RecommendationRead,
    ReviewCollection,
    ReviewSubmission,
    SavedBusinessWithDetails,
)
from ..api_utils import get_customer_profile
from .catalog import _public_business_query
from database.database import get_db
from ..deps import require_role
from database.models import (
    BusinessAccount,
    BusinessCategory,
    BusinessProfile,
    InteractionLog,
    InteractionType,
    Review,
    SavedBusiness,
    User,
    UserRole,
    VerificationStatus,
)
from ..schemas import CustomerProfileRead, InteractionLogRead, ReviewRead

router = APIRouter(tags=["customer"])
customer_user = require_role(UserRole.CUSTOMER)


@router.get("/customers/me/profile", response_model=CustomerProfileRead)
def read_customer_profile(
    db: Session = Depends(get_db),
    user: User = Depends(customer_user),
) -> CustomerProfileRead:
    return CustomerProfileRead.model_validate(get_customer_profile(db, user))


@router.patch("/customers/me/profile", response_model=CustomerProfileRead)
def update_customer_profile(
    payload: CustomerProfilePatch,
    db: Session = Depends(get_db),
    user: User = Depends(customer_user),
) -> CustomerProfileRead:
    profile = get_customer_profile(db, user)
    updates = payload.model_dump(exclude_unset=True, mode="json")
    if "full_name" in updates and updates["full_name"] is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "full_name cannot be null.",
        )
    if "full_name" in updates:
        updates["full_name"] = updates["full_name"].strip()
        if not updates["full_name"]:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "full_name cannot be empty.",
            )
    for field, value in updates.items():
        setattr(profile, field, value)
    db.commit()
    db.refresh(profile)
    return CustomerProfileRead.model_validate(profile)


@router.get("/customers/me/dashboard", response_model=CustomerDashboard)
def customer_dashboard(
    db: Session = Depends(get_db),
    user: User = Depends(customer_user),
) -> CustomerDashboard:
    profile = get_customer_profile(db, user)
    since = datetime.now(timezone.utc) - timedelta(days=30)
    return CustomerDashboard(
        review_count=db.query(Review).filter(Review.customer_id == profile.id).count(),
        saved_business_count=db.query(SavedBusiness)
        .filter(SavedBusiness.customer_id == profile.id)
        .count(),
        interactions_30_days=db.query(InteractionLog)
        .filter(
            InteractionLog.customer_id == profile.id,
            InteractionLog.created_at >= since,
        )
        .count(),
    )


def _visible_business(db: Session, business_id: uuid.UUID) -> BusinessAccount:
    business = (
        db.query(BusinessAccount)
        .join(
            BusinessProfile,
            BusinessProfile.business_account_id == BusinessAccount.id,
        )
        .filter(
            BusinessAccount.id == business_id,
            BusinessProfile.is_published.is_(True),
            BusinessProfile.verification_status == VerificationStatus.APPROVED,
        )
        .one_or_none()
    )
    if business is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Business not found.")
    return business


@router.get("/businesses/{business_id}/reviews", response_model=ReviewCollection)
def list_business_reviews(
    business_id: uuid.UUID,
    offset: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
) -> ReviewCollection:
    if offset < 0 or limit < 1 or limit > 100:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid pagination values.")
    _visible_business(db, business_id)
    reviews = (
        db.query(Review)
        .filter(Review.business_id == business_id)
        .order_by(Review.created_at.desc(), Review.id)
        .offset(offset)
        .limit(limit)
        .all()
    )
    average_rating, total = (
        db.query(func.coalesce(func.avg(Review.rating), 0), func.count(Review.id))
        .filter(Review.business_id == business_id)
        .one()
    )
    return ReviewCollection(
        items=[ReviewRead.model_validate(review) for review in reviews],
        average_rating=float(average_rating),
        total=int(total),
    )


@router.post(
    "/businesses/{business_id}/reviews",
    response_model=ReviewRead,
    status_code=status.HTTP_201_CREATED,
)
def create_review(
    business_id: uuid.UUID,
    payload: ReviewSubmission,
    db: Session = Depends(get_db),
    user: User = Depends(customer_user),
) -> ReviewRead:
    _visible_business(db, business_id)
    customer = get_customer_profile(db, user)
    if (
        db.query(Review)
        .filter(
            Review.customer_id == customer.id,
            Review.business_id == business_id,
        )
        .one_or_none()
        is not None
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "You have already reviewed this business.")
    review = Review(
        customer_id=customer.id,
        business_id=business_id,
        rating=payload.rating,
        comment_text=payload.comment_text,
    )
    db.add(review)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "You have already reviewed this business.") from exc
    db.refresh(review)
    return ReviewRead.model_validate(review)


@router.patch("/businesses/{business_id}/reviews/me", response_model=ReviewRead)
def update_my_review(
    business_id: uuid.UUID,
    payload: ReviewSubmission,
    db: Session = Depends(get_db),
    user: User = Depends(customer_user),
) -> ReviewRead:
    customer = get_customer_profile(db, user)
    review = (
        db.query(Review)
        .filter(
            Review.customer_id == customer.id,
            Review.business_id == business_id,
        )
        .one_or_none()
    )
    if review is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Review not found.")
    review.rating = payload.rating
    review.comment_text = payload.comment_text
    db.commit()
    db.refresh(review)
    return ReviewRead.model_validate(review)


@router.delete("/businesses/{business_id}/reviews/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_review(
    business_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(customer_user),
) -> Response:
    customer = get_customer_profile(db, user)
    review = (
        db.query(Review)
        .filter(
            Review.customer_id == customer.id,
            Review.business_id == business_id,
        )
        .one_or_none()
    )
    if review is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Review not found.")
    db.delete(review)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/customers/me/saved-businesses",
    response_model=list[SavedBusinessWithDetails],
)
def list_saved_businesses(
    db: Session = Depends(get_db),
    user: User = Depends(customer_user),
) -> list[SavedBusinessWithDetails]:
    customer = get_customer_profile(db, user)
    saved = (
        db.query(SavedBusiness)
        .join(BusinessAccount, SavedBusiness.business_id == BusinessAccount.id)
        .join(BusinessProfile, BusinessProfile.business_account_id == BusinessAccount.id)
        .filter(
            SavedBusiness.customer_id == customer.id,
            BusinessProfile.is_published.is_(True),
            BusinessProfile.verification_status == VerificationStatus.APPROVED,
        )
        .order_by(SavedBusiness.saved_at.desc())
        .all()
    )
    results: list[SavedBusinessWithDetails] = []
    for item in saved:
        row = (
            _public_business_query(db)
            .filter(BusinessAccount.id == item.business_id)
            .one()
        )
        business, profile, average_rating, review_count = row
        results.append(
            SavedBusinessWithDetails(
                business=PublicBusinessRead(
                    business=business,
                    profile=profile,
                    average_rating=float(average_rating),
                    review_count=int(review_count),
                ),
                saved_at=item.saved_at,
            )
        )
    return results


@router.put(
    "/customers/me/saved-businesses/{business_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def save_business(
    business_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(customer_user),
) -> Response:
    customer = get_customer_profile(db, user)
    _visible_business(db, business_id)
    saved = db.get(SavedBusiness, (customer.id, business_id))
    if saved is not None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    db.add(SavedBusiness(customer_id=customer.id, business_id=business_id))
    db.add(
        InteractionLog(
            customer_id=customer.id,
            business_id=business_id,
            interaction_type=InteractionType.SAVE,
            consent_flag=True,
        )
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        if db.get(SavedBusiness, (customer.id, business_id)) is None:
            raise
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/customers/me/saved-businesses/{business_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def unsave_business(
    business_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(customer_user),
) -> Response:
    customer = get_customer_profile(db, user)
    saved = db.get(SavedBusiness, (customer.id, business_id))
    if saved is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Saved business not found.")
    db.delete(saved)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/businesses/{business_id}/interactions",
    response_model=InteractionLogRead,
    status_code=status.HTTP_201_CREATED,
)
def record_interaction(
    business_id: uuid.UUID,
    payload: InteractionSubmission,
    db: Session = Depends(get_db),
    user: User = Depends(customer_user),
) -> InteractionLogRead:
    _visible_business(db, business_id)
    if payload.interaction_type == InteractionType.SAVE:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Use the saved-business endpoint to record a save interaction.",
        )
    customer = get_customer_profile(db, user)
    interaction = InteractionLog(
        customer_id=customer.id,
        business_id=business_id,
        interaction_type=payload.interaction_type,
        consent_flag=payload.consent_flag,
    )
    db.add(interaction)
    db.commit()
    db.refresh(interaction)
    return InteractionLogRead.model_validate(interaction)


@router.get("/customers/me/recommendations", response_model=list[RecommendationRead])
def recommend_businesses(
    limit: int = 10,
    db: Session = Depends(get_db),
    user: User = Depends(customer_user),
) -> list[RecommendationRead]:
    if limit < 1 or limit > 50:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "limit must be between 1 and 50.")
    customer = get_customer_profile(db, user)
    preferences = customer.preferences or {}
    preferred_categories = {
        uuid.UUID(value) for value in preferences.get("category_ids", [])
    }
    preferred_city = (preferences.get("location_city") or "").casefold()
    preferred_country = (preferences.get("location_country") or "").casefold()
    maximum_price = preferences.get("max_price")

    # Saved and reviewed category choices provide lightweight collaborative signals.
    learned_categories: set[uuid.UUID] = set()
    for business_id in (
        db.query(SavedBusiness.business_id)
        .filter(SavedBusiness.customer_id == customer.id)
        .union(
            db.query(Review.business_id).filter(Review.customer_id == customer.id)
        )
        .all()
    ):
        learned_categories.update(
            category_id
            for (category_id,) in db.query(BusinessCategory.category_id)
            .join(
                BusinessProfile,
                BusinessProfile.id == BusinessCategory.business_profile_id,
            )
            .filter(BusinessProfile.business_account_id == business_id[0])
            .all()
        )

    already_saved = {
        business_id
        for (business_id,) in db.query(SavedBusiness.business_id)
        .filter(SavedBusiness.customer_id == customer.id)
        .all()
    }
    rows = _public_business_query(db).all()
    recommendations: list[RecommendationRead] = []
    for business, profile, average_rating, review_count in rows:
        if business.id in already_saved:
            continue
        category_ids = {category.id for category in profile.categories}
        score = (
            5.0 * len(category_ids & preferred_categories)
            + 2.0 * len(category_ids & learned_categories)
            + float(average_rating) * 0.2
        )
        if preferred_city and (business.location_city or "").casefold() == preferred_city:
            score += 3.0
        if preferred_country and (business.location_country or "").casefold() == preferred_country:
            score += 1.5
        if maximum_price is not None:
            prices = [service.price for service in profile.services if service.price is not None]
            if prices and min(prices) <= Decimal(str(maximum_price)):
                score += 1.0
        recommendations.append(
            RecommendationRead(
                business=PublicBusinessRead(
                    business=business,
                    profile=profile,
                    average_rating=float(average_rating),
                    review_count=int(review_count),
                ),
                score=score,
            )
        )
    recommendations.sort(
        key=lambda item: (-item.score, item.business.business.business_name.casefold())
    )
    return recommendations[:limit]
