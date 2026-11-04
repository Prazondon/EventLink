from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field, HttpUrl

from database.models import InteractionType, VerificationStatus
from .schemas import BusinessAccountRead, BusinessProfileRead, ReviewRead


class CustomerPreferences(BaseModel):
    category_ids: list[uuid.UUID] = Field(default_factory=list, max_length=50)
    location_city: str | None = Field(default=None, max_length=120)
    location_country: str | None = Field(default=None, max_length=120)
    max_price: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)


class PublicBusinessRead(BaseModel):
    business: BusinessAccountRead
    profile: BusinessProfileRead
    average_rating: float
    review_count: int


class ReviewSubmission(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment_text: str | None = Field(default=None, max_length=5000)


class ReviewCollection(BaseModel):
    items: list[ReviewRead]
    average_rating: float
    total: int


class CustomerProfilePatch(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=150)
    preferences: CustomerPreferences | None = None


class BusinessProfileCreateRequest(BaseModel):
    description: str | None = Field(default=None, max_length=10000)
    category_ids: list[uuid.UUID] = Field(default_factory=list)


class ServiceCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    description: str | None = Field(default=None, max_length=5000)
    price: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    currency: str = Field(default="USD", pattern="^[A-Z]{3}$")


class PortfolioImageCreateRequest(BaseModel):
    image_url: HttpUrl
    caption: str | None = Field(default=None, max_length=255)
    display_order: int = Field(default=0, ge=0)


class InteractionSubmission(BaseModel):
    interaction_type: InteractionType
    consent_flag: bool = False


class VerificationSubmission(BaseModel):
    decision_reason: str | None = Field(default=None, max_length=2000)


class VerificationDecision(BaseModel):
    status: VerificationStatus
    decision_reason: str | None = Field(default=None, max_length=2000)


class VerificationQueueItem(BaseModel):
    record_id: uuid.UUID
    business_id: uuid.UUID
    business_name: str
    contact_email: str | None
    created_at: datetime


class BusinessDashboard(BaseModel):
    business_id: uuid.UUID
    review_count: int
    average_rating: float
    views_30_days: int
    contacts_30_days: int
    saves_30_days: int
    verification_status: VerificationStatus | None


class CustomerDashboard(BaseModel):
    review_count: int
    saved_business_count: int
    interactions_30_days: int


class RecommendationRead(BaseModel):
    business: PublicBusinessRead
    score: float


class SavedBusinessWithDetails(BaseModel):
    business: PublicBusinessRead
    saved_at: datetime
