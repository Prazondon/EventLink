"""
EventLink — Pydantic Schemas
==============================
Request/response validation models mirroring `models.py`. Pydantic v2.

Conventions
-----------
- `*Base`   — fields shared by create/read.
- `*Create` — input schema for POST endpoints (no server-generated fields).
- `*Update` — input schema for PATCH endpoints (all fields optional).
- `*Read`   — output schema for API responses (`model_config = ConfigDict(from_attributes=True)`
              so it can be built directly from an ORM instance, e.g.
              `CustomerProfileRead.model_validate(orm_obj)`).
- IDs are UUIDs; timestamps are timezone-aware `datetime`.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


# ---------------------------------------------------------------------------
# Shared enums (kept in sync with models.py)
# ---------------------------------------------------------------------------

class UserRole(str, enum.Enum):
    CUSTOMER = "customer"
    BUSINESS = "business"
    ADMIN = "admin"


class VerificationStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class InteractionType(str, enum.Enum):
    VIEW = "view"
    SAVE = "save"
    CONTACT = "contact"


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------

class UserBase(BaseModel):
    email: EmailStr
    role: UserRole


class UserCreate(UserBase):
    # Plaintext password only ever appears here, at the API boundary; it is
    # hashed by the service layer before hitting the ORM. Never store or log this.
    password: str = Field(min_length=10, max_length=128)


class UserUpdate(BaseModel):
    is_active: Optional[bool] = None
    is_verified: Optional[bool] = None


class UserRead(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    is_active: bool
    is_verified: bool
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# CustomerProfile
# ---------------------------------------------------------------------------

class CustomerProfileBase(BaseModel):
    full_name: str = Field(min_length=1, max_length=150)
    preferences: Optional[dict] = None


class CustomerProfileCreate(CustomerProfileBase):
    user_id: uuid.UUID


class CustomerProfileUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=1, max_length=150)
    preferences: Optional[dict] = None


class CustomerProfileRead(CustomerProfileBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    created_at: datetime


# ---------------------------------------------------------------------------
# BusinessAccount
# ---------------------------------------------------------------------------

class BusinessAccountBase(BaseModel):
    business_name: str = Field(min_length=1, max_length=200)
    contact_phone: Optional[str] = Field(default=None, max_length=30)
    contact_email: Optional[EmailStr] = None
    location_city: Optional[str] = Field(default=None, max_length=120)
    location_country: Optional[str] = Field(default=None, max_length=120)
    latitude: Optional[Decimal] = Field(default=None, ge=-90, le=90)
    longitude: Optional[Decimal] = Field(default=None, ge=-180, le=180)


class BusinessAccountCreate(BusinessAccountBase):
    user_id: uuid.UUID


class BusinessAccountUpdate(BaseModel):
    business_name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    contact_phone: Optional[str] = Field(default=None, max_length=30)
    contact_email: Optional[EmailStr] = None
    location_city: Optional[str] = Field(default=None, max_length=120)
    location_country: Optional[str] = Field(default=None, max_length=120)
    latitude: Optional[Decimal] = Field(default=None, ge=-90, le=90)
    longitude: Optional[Decimal] = Field(default=None, ge=-180, le=180)


class BusinessAccountRead(BusinessAccountBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    created_at: datetime


# ---------------------------------------------------------------------------
# Category
# ---------------------------------------------------------------------------

class CategoryBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = None


class CategoryCreate(CategoryBase):
    pass


class CategoryRead(CategoryBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------

class ServiceBase(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    description: Optional[str] = None
    price: Optional[Decimal] = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    currency: str = Field(default="USD", min_length=3, max_length=3)


class ServiceCreate(ServiceBase):
    business_profile_id: uuid.UUID


class ServiceUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=150)
    description: Optional[str] = None
    price: Optional[Decimal] = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    currency: Optional[str] = Field(default=None, min_length=3, max_length=3)


class ServiceRead(ServiceBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    business_profile_id: uuid.UUID


# ---------------------------------------------------------------------------
# PortfolioImage
# ---------------------------------------------------------------------------

class PortfolioImageBase(BaseModel):
    image_url: str = Field(max_length=2048)
    caption: Optional[str] = Field(default=None, max_length=255)
    display_order: int = 0


class PortfolioImageCreate(PortfolioImageBase):
    business_profile_id: uuid.UUID


class PortfolioImageRead(PortfolioImageBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    business_profile_id: uuid.UUID


# ---------------------------------------------------------------------------
# BusinessProfile
# ---------------------------------------------------------------------------

class BusinessProfileBase(BaseModel):
    description: Optional[str] = None


class BusinessProfileCreate(BusinessProfileBase):
    business_account_id: uuid.UUID
    category_ids: list[uuid.UUID] = Field(default_factory=list)


class BusinessProfileUpdate(BaseModel):
    description: Optional[str] = None
    is_published: Optional[bool] = None
    category_ids: Optional[list[uuid.UUID]] = None


class BusinessProfileRead(BusinessProfileBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    business_account_id: uuid.UUID
    verification_status: VerificationStatus
    is_published: bool
    created_at: datetime
    updated_at: datetime
    categories: list[CategoryRead] = Field(default_factory=list)
    services: list[ServiceRead] = Field(default_factory=list)
    portfolio_images: list[PortfolioImageRead] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Review  (FR-REV-01/03)
# ---------------------------------------------------------------------------

class ReviewBase(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment_text: Optional[str] = Field(default=None, max_length=5000)


class ReviewCreate(ReviewBase):
    customer_id: uuid.UUID
    business_id: uuid.UUID


class ReviewUpdate(BaseModel):
    rating: Optional[int] = Field(default=None, ge=1, le=5)
    comment_text: Optional[str] = Field(default=None, max_length=5000)


class ReviewRead(ReviewBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    customer_id: uuid.UUID
    business_id: uuid.UUID
    created_at: datetime


# ---------------------------------------------------------------------------
# InteractionLog  (feeds FR-REC collaborative filtering)
# ---------------------------------------------------------------------------

class InteractionLogBase(BaseModel):
    interaction_type: InteractionType
    consent_flag: bool = False


class InteractionLogCreate(InteractionLogBase):
    customer_id: Optional[uuid.UUID] = None
    business_id: uuid.UUID

    @field_validator("consent_flag")
    @classmethod
    def contact_requires_no_special_consent_but_save_should_flag(cls, v: bool, info) -> bool:
        # Placeholder for NFR-SEC-02 data-minimisation checks — e.g. reject
        # logging when consent_flag is False and interaction_type == SAVE.
        return v


class InteractionLogRead(InteractionLogBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    customer_id: Optional[uuid.UUID]
    business_id: uuid.UUID
    created_at: datetime


# ---------------------------------------------------------------------------
# SavedBusiness
# ---------------------------------------------------------------------------

class SavedBusinessCreate(BaseModel):
    customer_id: uuid.UUID
    business_id: uuid.UUID


class SavedBusinessRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    customer_id: uuid.UUID
    business_id: uuid.UUID
    saved_at: datetime


# ---------------------------------------------------------------------------
# VerificationRecord  (FR-BPM-03/04)
# ---------------------------------------------------------------------------

class VerificationRecordCreate(BaseModel):
    business_id: uuid.UUID
    status: VerificationStatus
    reviewer_id: Optional[uuid.UUID] = None
    decision_reason: Optional[str] = Field(default=None, max_length=2000)


class VerificationRecordRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    business_id: uuid.UUID
    status: VerificationStatus
    reviewer_id: Optional[uuid.UUID]
    decision_reason: Optional[str]
    created_at: datetime