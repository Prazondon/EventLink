from __future__ import annotations

import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from ..api_schemas import PublicBusinessRead
from database.database import get_db
from ..deps import require_role
from database.models import (
    BusinessAccount,
    BusinessProfile,
    Category,
    Review,
    Service,
    UserRole,
    VerificationStatus,
)
from ..schemas import CategoryCreate, CategoryRead, CategoryUpdate, MessageResponse

router = APIRouter(tags=["catalog"])
admin_user = require_role(UserRole.ADMIN)


def _public_business_query(db: Session):
    return (
        db.query(
            BusinessAccount,
            BusinessProfile,
            func.coalesce(func.avg(Review.rating), 0).label("average_rating"),
            func.count(Review.id).label("review_count"),
        )
        .join(
            BusinessProfile,
            BusinessProfile.business_account_id == BusinessAccount.id,
        )
        .outerjoin(Review, Review.business_id == BusinessAccount.id)
        .options(
            selectinload(BusinessProfile.categories),
            selectinload(BusinessProfile.services),
            selectinload(BusinessProfile.portfolio_images),
        )
        .filter(
            BusinessProfile.is_published.is_(True),
            BusinessProfile.verification_status == VerificationStatus.APPROVED,
        )
        .group_by(BusinessAccount.id, BusinessProfile.id)
    )


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _serialize_business(row: tuple) -> PublicBusinessRead:
    business, profile, average_rating, review_count = row
    return PublicBusinessRead(
        business=business,
        profile=profile,
        average_rating=float(average_rating),
        review_count=int(review_count),
    )


@router.get("/categories", response_model=list[CategoryRead])
def list_categories(db: Session = Depends(get_db)) -> list[CategoryRead]:
    categories = db.query(Category).order_by(Category.name).all()
    return [CategoryRead.model_validate(category) for category in categories]


@router.get("/businesses", response_model=list[PublicBusinessRead])
def search_businesses(
    q: str | None = Query(default=None, min_length=1, max_length=200),
    city: str | None = Query(default=None, max_length=120),
    country: str | None = Query(default=None, max_length=120),
    category_id: uuid.UUID | None = None,
    min_price: Decimal | None = Query(default=None, ge=0),
    max_price: Decimal | None = Query(default=None, ge=0),
    sort: str = Query(default="rating", pattern="^(rating|name|newest)$"),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> list[PublicBusinessRead]:
    if min_price is not None and max_price is not None and min_price > max_price:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "min_price cannot be greater than max_price.",
        )
    query = _public_business_query(db)
    if q and q.strip():
        term = f"%{_escape_like(q.strip())}%"
        query = query.filter(
            or_(
                BusinessAccount.business_name.ilike(term, escape="\\"),
                BusinessProfile.description.ilike(term, escape="\\"),
                BusinessProfile.categories.any(Category.name.ilike(term, escape="\\")),
                BusinessProfile.services.any(Service.name.ilike(term, escape="\\")),
            )
        )
    # Location filters match partial names ("Kath" finds "Kathmandu") and treat
    # user input literally rather than as LIKE wildcards.
    if city and city.strip():
        query = query.filter(
            BusinessAccount.location_city.ilike(f"%{_escape_like(city.strip())}%", escape="\\")
        )
    if country and country.strip():
        query = query.filter(
            BusinessAccount.location_country.ilike(f"%{_escape_like(country.strip())}%", escape="\\")
        )
    if category_id:
        query = query.filter(BusinessProfile.categories.any(Category.id == category_id))
    if min_price is not None or max_price is not None:
        price_filters = [Service.price.is_not(None)]
        if min_price is not None:
            price_filters.append(Service.price >= min_price)
        if max_price is not None:
            price_filters.append(Service.price <= max_price)
        query = query.filter(BusinessProfile.services.any(and_(*price_filters)))

    if sort == "name":
        query = query.order_by(BusinessAccount.business_name, BusinessAccount.id)
    elif sort == "newest":
        query = query.order_by(BusinessProfile.created_at.desc(), BusinessAccount.id)
    else:
        # coalesce keeps unreviewed businesses below rated ones: PostgreSQL sorts
        # NULL first under DESC, which put every unreviewed listing at the top.
        query = query.order_by(
            func.coalesce(func.avg(Review.rating), 0).desc(),
            func.count(Review.id).desc(),
            BusinessAccount.id,
        )

    rows = query.offset(offset).limit(limit).all()
    return [_serialize_business(row) for row in rows]


@router.get("/businesses/{business_id}", response_model=PublicBusinessRead)
def get_business(
    business_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> PublicBusinessRead:
    row = (
        _public_business_query(db)
        .filter(BusinessAccount.id == business_id)
        .one_or_none()
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Business not found.")
    return _serialize_business(row)


@router.post(
    "/admin/categories",
    response_model=CategoryRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(admin_user)],
)
def create_category(
    payload: CategoryCreate,
    db: Session = Depends(get_db),
) -> CategoryRead:
    name = payload.name.strip()
    category = Category(name=name, description=payload.description)
    if not category.name:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Category name is required.")
    if (
        db.query(Category)
        .filter(func.lower(Category.name) == name.casefold())
        .first()
        is not None
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "A category with this name already exists.")
    db.add(category)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "A category with this name already exists.",
        ) from exc
    db.refresh(category)
    return CategoryRead.model_validate(category)


@router.patch(
    "/admin/categories/{category_id}",
    response_model=CategoryRead,
    dependencies=[Depends(admin_user)],
)
def update_category(
    category_id: uuid.UUID,
    payload: CategoryUpdate,
    db: Session = Depends(get_db),
) -> CategoryRead:
    category = db.get(Category, category_id)
    if category is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found.")
    updates = payload.model_dump(exclude_unset=True)
    if "name" in updates:
        if updates["name"] is None or not updates["name"].strip():
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Category name is required.")
        name = updates["name"].strip()
        duplicate = (
            db.query(Category)
            .filter(
                func.lower(Category.name) == name.casefold(),
                Category.id != category_id,
            )
            .first()
        )
        if duplicate is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "A category with this name already exists.")
        updates["name"] = name
    for field, value in updates.items():
        setattr(category, field, value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "A category with this name already exists.",
        ) from exc
    db.refresh(category)
    return CategoryRead.model_validate(category)


@router.delete(
    "/admin/categories/{category_id}",
    response_model=MessageResponse,
    dependencies=[Depends(admin_user)],
)
def delete_category(
    category_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> MessageResponse:
    category = db.get(Category, category_id)
    if category is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found.")
    db.delete(category)
    db.commit()
    return MessageResponse(message="Category deleted.")
