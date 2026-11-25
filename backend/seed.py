"""Seed demo data for local development and demos (FR-TEST-02).

    python -m backend.seed            # add demo data (safe to re-run)
    python -m backend.seed --reset    # delete the demo accounts first

Creates categories, one administrator, a handful of approved businesses with
services, portfolio images and reviews, one business awaiting verification,
and two customers. Every demo account uses the password printed at the end.
Refuses to run when EVENTLINK_ENVIRONMENT=production.
"""

from __future__ import annotations

import argparse
import sys
from decimal import Decimal

from database.database import SessionLocal
from database.models import (
    BusinessAccount,
    BusinessProfile,
    Category,
    CustomerProfile,
    InteractionLog,
    InteractionType,
    PortfolioImage,
    Review,
    SavedBusiness,
    Service,
    User,
    UserRole,
    VerificationRecord,
    VerificationStatus,
)
from .config import settings
from .security import hash_password

DEMO_PASSWORD = "EventLink-Demo-2026"
DEMO_DOMAIN = "@demo-eventlink.com"


def photo(photo_id: str, width: int = 1200) -> str:
    return f"https://images.unsplash.com/{photo_id}?auto=format&fit=crop&w={width}&q=80"


CATEGORIES = [
    ("Venues", "Halls, gardens, rooftops and private rooms."),
    ("Photography", "Stills, film and photo booths."),
    ("Catering", "Feasts, grazing tables and bar service."),
    ("Florists", "Arrangements, arches and table styling."),
    ("Music", "Bands, DJs and ceremony players."),
    ("Planning", "Full planning and day-of coordination."),
]

# name, category, city, description, phone, services[(name, desc, price)], images[(photo id, caption)]
BUSINESSES = [
    ("Himal Garden Venue", "Venues", "Kathmandu",
     "A walled garden and glass pavilion for weddings and receptions of 80 to 400 guests, with an in-house events team.",
     "+977 1 555 0101",
     [("Garden hire (full day)", "Garden, pavilion and bridal suite.", 2400),
      ("Evening reception", "Six hours, lighting and sound included.", 1500)],
     [("photo-1519167758481-83f550bb49b3", "Reception hall under warm lights"),
      ("photo-1464366400600-7168b8af9bc3", "A laid table with candles")]),
    ("Lakeside Lens Studio", "Photography", "Pokhara",
     "Documentary-style wedding and portrait photography with a second shooter on every booking.",
     "+977 61 555 0102",
     [("Half-day coverage", "Four hours, 300 edited photos.", 450),
      ("Full-day coverage", "Eight hours, 600 photos and an album.", 900)],
     [("photo-1537633552985-df8429e8048b", "A couple photographed outdoors")]),
    ("Saffron & Sage Catering", "Catering", "Lalitpur",
     "Seasonal menus, grazing tables and staffed bar service. Tastings available before you book.",
     "+977 1 555 0103",
     [("Buffet (per guest)", "Three mains, two sides, dessert.", 28),
      ("Grazing table", "Serves 40 guests.", 380)],
     [("photo-1555244162-803834f70033", "A buffet of plated dishes")]),
    ("Wild Bloom Florals", "Florists", "Bhaktapur",
     "Loose, garden-style bouquets, arches and table arrangements from local growers.",
     "+977 1 555 0104",
     [("Bridal bouquet", "Seasonal stems, hand tied.", 90),
      ("Ceremony arch", "Setup and take-down included.", 420)],
     [("photo-1523438885200-e635ba2c371e", "Loose garden flowers")]),
    ("Night Owl Sound", "Music", "Kathmandu",
     "Wedding bands and DJs. Live sets, ceremony music and a full sound check before doors.",
     "+977 1 555 0105",
     [("DJ (4 hours)", "Sound system and lighting.", 350),
      ("Live band (3 sets)", "Four-piece band.", 800)],
     [("photo-1501386761578-eac5c94b800a", "A crowd in front of a lit stage")]),
    ("Pinewood Event Planners", "Planning", "Kathmandu",
     "Full planning and day-of coordination for weddings, birthdays and corporate events.",
     "+977 1 555 0106",
     [("Day-of coordination", "Timeline, suppliers and on-site lead.", 600),
      ("Full planning", "From first call to last dance.", 2200)],
     [("photo-1464366400600-7168b8af9bc3", "A decorated table with place settings")]),
]

PENDING_BUSINESS = (
    "Riverbend Pop-up Bar", "Catering", "Pokhara",
    "Mobile cocktail and mocktail bar for private parties. Newly listed, awaiting verification.",
    "+977 61 555 0107",
    [("Bar service (3 hours)", "Bartender and glassware.", 320)],
    [],
)

CUSTOMERS = [
    ("Asha Rai", "asha", {"category_ids": [], "location_city": "Kathmandu", "max_price": 1000}),
    ("Binod Shrestha", "binod", {"category_ids": [], "location_city": "Pokhara", "max_price": 600}),
]

REVIEWS = [
    # business index, customer index, rating, comment
    (0, 0, 5, "Beautiful setting and the team handled every detail on the day."),
    (0, 1, 4, "Gorgeous garden. Parking was tight but staff were very helpful."),
    (1, 0, 5, "Relaxed, kind and the photos are stunning. Delivered in under two weeks."),
    (2, 1, 5, "Guests are still talking about the food. The tasting made choosing easy."),
    (2, 0, 4, "Great menu, slightly late setting up but worth it."),
    (3, 0, 5, "Exactly the loose, garden look we wanted."),
    (4, 1, 4, "Packed the dance floor all night."),
    (5, 0, 5, "Calm, organised and never flustered. Highly recommend."),
]


def reset(db, domain: str = DEMO_DOMAIN) -> None:
    """Delete demo accounts and everything hanging off them."""
    users = db.query(User).filter(User.email.like(f"%{domain}")).all()
    user_ids = [user.id for user in users]
    if not user_ids:
        return
    customer_ids = [row[0] for row in db.query(CustomerProfile.id).filter(CustomerProfile.user_id.in_(user_ids))]
    business_ids = [row[0] for row in db.query(BusinessAccount.id).filter(BusinessAccount.user_id.in_(user_ids))]
    # Interaction logs keep history and are not cascaded, so clear them first.
    db.query(InteractionLog).filter(
        InteractionLog.customer_id.in_(customer_ids) | InteractionLog.business_id.in_(business_ids)
    ).delete(synchronize_session=False)
    db.expire_all()
    for user in db.query(User).filter(User.id.in_(user_ids)).all():
        db.delete(user)
    db.commit()


def make_business(db, index, spec, *, approved, admin, categories):
    name, category, city, description, phone, services, images = spec
    user = User(
        email=f"business{index + 1}{DEMO_DOMAIN}",
        password_hash=hash_password(DEMO_PASSWORD),
        role=UserRole.BUSINESS,
        is_active=True,
        is_verified=approved,
    )
    account = BusinessAccount(
        user=user,
        business_name=name,
        contact_phone=phone,
        contact_email=user.email,
        location_city=city,
        location_country="Nepal",
    )
    profile = BusinessProfile(
        business=account,
        description=description,
        categories=[categories[category]],
        verification_status=VerificationStatus.APPROVED if approved else VerificationStatus.PENDING,
        is_published=approved,
    )
    for service_name, service_description, price in services:
        profile.services.append(
            Service(name=service_name, description=service_description, price=Decimal(price), currency="USD")
        )
    for order, (photo_id, caption) in enumerate(images):
        profile.portfolio_images.append(PortfolioImage(image_url=photo(photo_id), caption=caption, display_order=order))
    db.add_all([user, account, profile])
    db.flush()
    db.add(
        VerificationRecord(
            business_id=account.id,
            status=VerificationStatus.APPROVED if approved else VerificationStatus.PENDING,
            reviewer_id=admin.id if approved else None,
            decision_reason="Demo data" if approved else "Requested verification",
        )
    )
    return account


def seed(db) -> None:
    categories = {}
    for name, description in CATEGORIES:
        category = db.query(Category).filter(Category.name == name).one_or_none()
        if category is None:
            category = Category(name=name, description=description)
            db.add(category)
        categories[name] = category
    db.flush()

    admin_email = f"admin{DEMO_DOMAIN}"
    admin = db.query(User).filter(User.email == admin_email).one_or_none()
    if admin is None:
        admin = User(
            email=admin_email,
            password_hash=hash_password(DEMO_PASSWORD),
            role=UserRole.ADMIN,
            is_active=True,
            is_verified=True,
        )
        db.add(admin)
        db.flush()

    if db.query(User).filter(User.email == f"business1{DEMO_DOMAIN}").count():
        db.commit()
        print("Demo businesses already exist; use --reset to rebuild them.")
        return

    accounts = [
        make_business(db, index, spec, approved=True, admin=admin, categories=categories)
        for index, spec in enumerate(BUSINESSES)
    ]
    make_business(db, len(BUSINESSES), PENDING_BUSINESS, approved=False, admin=admin, categories=categories)

    customers = []
    for full_name, handle, preferences in CUSTOMERS:
        user = User(
            email=f"{handle}{DEMO_DOMAIN}",
            password_hash=hash_password(DEMO_PASSWORD),
            role=UserRole.CUSTOMER,
            is_active=True,
            is_verified=True,
        )
        profile = CustomerProfile(user=user, full_name=full_name, preferences=preferences)
        db.add_all([user, profile])
        customers.append(profile)
    db.flush()
    customers[0].preferences = {**CUSTOMERS[0][2], "category_ids": [str(categories["Photography"].id), str(categories["Venues"].id)]}
    customers[1].preferences = {**CUSTOMERS[1][2], "category_ids": [str(categories["Catering"].id)]}

    for business_index, customer_index, rating, comment in REVIEWS:
        db.add(
            Review(
                customer_id=customers[customer_index].id,
                business_id=accounts[business_index].id,
                rating=rating,
                comment_text=comment,
            )
        )
    for account in accounts:
        for customer in customers:
            db.add(InteractionLog(customer_id=customer.id, business_id=account.id, interaction_type=InteractionType.VIEW, consent_flag=True))
    db.add(SavedBusiness(customer_id=customers[0].id, business_id=accounts[1].id))
    db.add(SavedBusiness(customer_id=customers[0].id, business_id=accounts[0].id))
    db.commit()

    print("Demo data created.\n")
    print(f"  Password for every demo account: {DEMO_PASSWORD}\n")
    print(f"  Admin     admin{DEMO_DOMAIN}")
    print(f"  Customer  asha{DEMO_DOMAIN}   (has saved businesses and reviews)")
    print(f"  Customer  binod{DEMO_DOMAIN}")
    print(f"  Business  business1{DEMO_DOMAIN} ... business6{DEMO_DOMAIN}   (approved)")
    print(f"  Business  business7{DEMO_DOMAIN}   (waiting for verification)")


def main() -> int:
    parser = argparse.ArgumentParser(prog="python -m backend.seed")
    parser.add_argument("--reset", action="store_true", help="delete existing demo accounts first")
    args = parser.parse_args()
    if settings.environment.casefold() == "production":
        print("Refusing to seed demo data in production.", file=sys.stderr)
        return 2
    with SessionLocal() as db:
        if args.reset:
            reset(db)
        seed(db)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
