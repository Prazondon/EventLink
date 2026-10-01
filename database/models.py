"""
EventLink — SQLAlchemy ORM Models
===================================
Implements the core data entities from EventLink SRS v0.2, §6.1 "Core Data
Entities", plus the supporting join/detail tables needed to satisfy the
functional requirements in §3 (FR-AUTH, FR-BPM, FR-SRCH, FR-REC, FR-REV,
FR-DASH).

Design notes
------------
- SQLAlchemy 2.0 declarative style (`Mapped` / `mapped_column`).
- A single `User` table holds authentication concerns (FR-AUTH-01/02) with a
  `role` discriminator; `CustomerProfile` and `BusinessAccount` hold the
  role-specific data and are linked 1:1 back to `User`. This avoids
  duplicating email/password-hash handling while still matching the SRS's
  separate "Customer Account" / "Business Account" entities.
- `BusinessAccount` (identity/contact/location) is kept distinct from
  `BusinessProfile` (listing content: description, services, portfolio,
  verification) per SRS §6.1, joined 1:1 — a business can exist without a
  published profile yet.
- All FKs declare explicit `ondelete` behaviour so referential integrity is
  enforced at the database level, not just in the ORM.
- Money uses `Numeric`, never `Float`.
- Enums are backed by native Postgres ENUM types (`create_type=True`) but
  fall back gracefully on SQLite for local dev/testing.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    mapped_column,
    relationship,
)
from sqlalchemy.types import Enum as SAEnum, Uuid


class Base(DeclarativeBase):
    """Shared declarative base for all EventLink models."""
    pass


def _uuid_pk() -> Mapped[uuid.UUID]:
    """Standard UUID primary key column factory."""
    return mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )


# ---------------------------------------------------------------------------
# Enums
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
# 1. User — shared authentication (FR-AUTH-01, FR-AUTH-02)
# ---------------------------------------------------------------------------

class User(Base):
    """Authentication identity shared by customers, businesses, and admins.

    Role-specific data lives in `CustomerProfile` / `BusinessAccount`
    (1:1, `user_id` unique), keeping credential handling in one place.
    """

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = _uuid_pk()
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        SAEnum(UserRole, name="user_role", native_enum=True), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    customer_profile: Mapped["CustomerProfile | None"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    business_account: Mapped["BusinessAccount | None"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    verification_decisions: Mapped[list["VerificationRecord"]] = relationship(
        back_populates="reviewer"
    )

    __table_args__ = (
        Index("ix_users_role", "role"),
    )


# ---------------------------------------------------------------------------
# 2. CustomerProfile ("Customer Account" in SRS §6.1)
# ---------------------------------------------------------------------------

class CustomerProfile(Base):
    __tablename__ = "customer_profiles"

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    # category/price/location preferences feeding FR-REC content-based filtering
    preferences: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="customer_profile")
    reviews: Mapped[list["Review"]] = relationship(back_populates="customer", cascade="all, delete-orphan")
    interactions: Mapped[list["InteractionLog"]] = relationship(back_populates="customer")
    saved_businesses: Mapped[list["SavedBusiness"]] = relationship(
        back_populates="customer", cascade="all, delete-orphan"
    )


# ---------------------------------------------------------------------------
# 3. BusinessAccount ("Business Account" in SRS §6.1)
# ---------------------------------------------------------------------------

class BusinessAccount(Base):
    __tablename__ = "business_accounts"

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    business_name: Mapped[str] = mapped_column(String(200), nullable=False)
    contact_phone: Mapped[str | None] = mapped_column(String(30))
    contact_email: Mapped[str | None] = mapped_column(String(320))
    location_city: Mapped[str | None] = mapped_column(String(120))
    location_country: Mapped[str | None] = mapped_column(String(120))
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="business_account")
    profile: Mapped["BusinessProfile | None"] = relationship(
        back_populates="business", uselist=False, cascade="all, delete-orphan"
    )
    reviews_received: Mapped[list["Review"]] = relationship(back_populates="business", cascade="all, delete-orphan")
    interactions_received: Mapped[list["InteractionLog"]] = relationship(back_populates="business")
    verification_records: Mapped[list["VerificationRecord"]] = relationship(
        back_populates="business", cascade="all, delete-orphan"
    )
    saved_by: Mapped[list["SavedBusiness"]] = relationship(back_populates="business", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_business_accounts_location", "location_city", "location_country"),
    )


# ---------------------------------------------------------------------------
# 4. BusinessProfile / Listing (SRS §6.1, §3.2)
# ---------------------------------------------------------------------------

class BusinessProfile(Base):
    __tablename__ = "business_profiles"

    id: Mapped[uuid.UUID] = _uuid_pk()
    business_account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("business_accounts.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    description: Mapped[str | None] = mapped_column(Text)
    verification_status: Mapped[VerificationStatus] = mapped_column(
        SAEnum(VerificationStatus, name="verification_status", native_enum=True),
        default=VerificationStatus.PENDING,
        nullable=False,
    )
    is_published: Mapped[bool] = mapped_column(default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    business: Mapped["BusinessAccount"] = relationship(back_populates="profile")
    categories: Mapped[list["Category"]] = relationship(
        secondary="business_categories", back_populates="business_profiles"
    )
    services: Mapped[list["Service"]] = relationship(back_populates="business_profile", cascade="all, delete-orphan")
    portfolio_images: Mapped[list["PortfolioImage"]] = relationship(
        back_populates="business_profile", cascade="all, delete-orphan", order_by="PortfolioImage.display_order"
    )

    __table_args__ = (
        Index("ix_business_profiles_status", "verification_status", "is_published"),
    )


# ---------------------------------------------------------------------------
# 5. Category (SRS §6.1) — M2M with BusinessProfile
# ---------------------------------------------------------------------------

class Category(Base):
    __tablename__ = "categories"

    id: Mapped[uuid.UUID] = _uuid_pk()
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)

    business_profiles: Mapped[list["BusinessProfile"]] = relationship(
        secondary="business_categories", back_populates="categories"
    )


class BusinessCategory(Base):
    """Association table: BusinessProfile <-> Category (many-to-many)."""

    __tablename__ = "business_categories"

    business_profile_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("business_profiles.id", ondelete="CASCADE"), primary_key=True
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True
    )


# ---------------------------------------------------------------------------
# 6. Service — line items under a BusinessProfile (services, pricing)
# ---------------------------------------------------------------------------

class Service(Base):
    __tablename__ = "services"

    id: Mapped[uuid.UUID] = _uuid_pk()
    business_profile_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("business_profiles.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)

    business_profile: Mapped["BusinessProfile"] = relationship(back_populates="services")

    __table_args__ = (
        CheckConstraint("price IS NULL OR price >= 0", name="ck_services_price_non_negative"),
    )


# ---------------------------------------------------------------------------
# 7. PortfolioImage — business listing images (SRS §6.1 "portfolio images")
# ---------------------------------------------------------------------------

class PortfolioImage(Base):
    __tablename__ = "portfolio_images"

    id: Mapped[uuid.UUID] = _uuid_pk()
    business_profile_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("business_profiles.id", ondelete="CASCADE"), nullable=False
    )
    image_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    caption: Mapped[str | None] = mapped_column(String(255))
    display_order: Mapped[int] = mapped_column(default=0, nullable=False)

    business_profile: Mapped["BusinessProfile"] = relationship(back_populates="portfolio_images")


# ---------------------------------------------------------------------------
# 8. Review (SRS §6.1, §3.5 — FR-REV)
# ---------------------------------------------------------------------------

class Review(Base):
    __tablename__ = "reviews"

    id: Mapped[uuid.UUID] = _uuid_pk()
    customer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("customer_profiles.id", ondelete="CASCADE"), nullable=False
    )
    business_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("business_accounts.id", ondelete="CASCADE"), nullable=False
    )
    rating: Mapped[int] = mapped_column(nullable=False)
    comment_text: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    customer: Mapped["CustomerProfile"] = relationship(back_populates="reviews")
    business: Mapped["BusinessAccount"] = relationship(back_populates="reviews_received")

    __table_args__ = (
        CheckConstraint("rating BETWEEN 1 AND 5", name="ck_reviews_rating_range"),
        # One review per customer per business — resubmission should UPDATE, not INSERT
        UniqueConstraint("customer_id", "business_id", name="uq_reviews_customer_business"),
        Index("ix_reviews_business_id", "business_id"),
    )


# ---------------------------------------------------------------------------
# 9. InteractionLog (SRS §6.1 — feeds collaborative filtering, FR-REC)
# ---------------------------------------------------------------------------

class InteractionLog(Base):
    __tablename__ = "interaction_logs"

    id: Mapped[uuid.UUID] = _uuid_pk()
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("customer_profiles.id", ondelete="SET NULL"), nullable=True
    )
    business_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("business_accounts.id", ondelete="CASCADE"), nullable=False
    )
    interaction_type: Mapped[InteractionType] = mapped_column(
        SAEnum(InteractionType, name="interaction_type", native_enum=True), nullable=False
    )
    consent_flag: Mapped[bool] = mapped_column(default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    customer: Mapped["CustomerProfile | None"] = relationship(back_populates="interactions")
    business: Mapped["BusinessAccount"] = relationship(back_populates="interactions_received")

    __table_args__ = (
        # Collaborative filtering scans by customer and by business independently
        Index("ix_interactions_customer_id", "customer_id"),
        Index("ix_interactions_business_id", "business_id"),
        Index("ix_interactions_type_created", "interaction_type", "created_at"),
    )


# ---------------------------------------------------------------------------
# 10. SavedBusiness — M2M "saved businesses" (SRS §6.1, CustomerProfile)
# ---------------------------------------------------------------------------

class SavedBusiness(Base):
    __tablename__ = "saved_businesses"

    customer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("customer_profiles.id", ondelete="CASCADE"), primary_key=True
    )
    business_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("business_accounts.id", ondelete="CASCADE"), primary_key=True
    )
    saved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    customer: Mapped["CustomerProfile"] = relationship(back_populates="saved_businesses")
    business: Mapped["BusinessAccount"] = relationship(back_populates="saved_by")


# ---------------------------------------------------------------------------
# 11. VerificationRecord (SRS §6.1, §3.2 — FR-BPM-03/04)
# ---------------------------------------------------------------------------

class VerificationRecord(Base):
    __tablename__ = "verification_records"

    id: Mapped[uuid.UUID] = _uuid_pk()
    business_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("business_accounts.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[VerificationStatus] = mapped_column(
        SAEnum(VerificationStatus, name="verification_record_status", native_enum=True), nullable=False
    )
    # Nullable: a decision may be system-generated before an admin reviews it
    reviewer_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    decision_reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    business: Mapped["BusinessAccount"] = relationship(back_populates="verification_records")
    reviewer: Mapped["User | None"] = relationship(back_populates="verification_decisions")

    __table_args__ = (
        Index("ix_verification_records_business_id", "business_id"),
    )