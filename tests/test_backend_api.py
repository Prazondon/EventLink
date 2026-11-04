from __future__ import annotations

from database.models import User, UserRole
from backend.security import hash_password
from backend.schemas import InteractionLogCreate, InteractionType

from .conftest import TestSession
import pytest

PASSWORD = "Correct-Horse-Battery-1"


def test_save_interactions_require_consent():
    with pytest.raises(ValueError, match="Consent is required"):
        InteractionLogCreate(
            interaction_type=InteractionType.SAVE,
            business_id="f0f3db15-f5fb-4c8f-a5b1-d843dc52d907",
        )
    saved_interaction = InteractionLogCreate(
        interaction_type=InteractionType.SAVE,
        consent_flag=True,
        business_id="f0f3db15-f5fb-4c8f-a5b1-d843dc52d907",
    )
    assert saved_interaction.consent_flag is True


def register_customer(client, email="customer@example.com"):
    response = client.post(
        "/auth/register/customer",
        json={"email": email, "password": PASSWORD, "full_name": "A Customer"},
    )
    assert response.status_code == 201, response.text
    token_response = client.post(
        "/auth/login",
        json={"email": email, "password": PASSWORD},
    )
    assert token_response.status_code == 200, token_response.text
    return token_response.json()["access_token"]


def register_business(client, email="business@example.com"):
    response = client.post(
        "/auth/register/business",
        json={"email": email, "password": PASSWORD, "business_name": "EventLink Events",
              "location_city": "Kathmandu", "location_country": "Nepal"},
    )
    assert response.status_code == 201, response.text
    token_response = client.post(
        "/auth/login",
        json={"email": email, "password": PASSWORD},
    )
    assert token_response.status_code == 200, token_response.text
    return token_response.json()["access_token"]


def register_admin():
    with TestSession() as db:
        db.add(
            User(
                email="admin@example.com",
                password_hash=hash_password(PASSWORD),
                role=UserRole.ADMIN,
                is_active=True,
                is_verified=True,
            )
        )
        db.commit()


def login_headers(client, email="admin@example.com"):
    response = client.post("/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_authentication_and_role_guards(client, caplog):
    token = register_customer(client)

    current_user = client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert current_user.status_code == 200
    assert current_user.json()["role"] == "customer"
    assert client.post(
        "/auth/logout",
        headers={"Authorization": f"Bearer {token}"},
    ).status_code == 200

    duplicate = client.post(
        "/auth/register/customer",
        json={"email": "CUSTOMER@example.com", "password": PASSWORD, "full_name": "Duplicate"},
    )
    assert duplicate.status_code == 409

    bad_login = client.post(
        "/auth/login",
        json={"email": "customer@example.com", "password": "not-the-password"},
    )
    assert bad_login.status_code == 401

    forbidden = client.get(
        "/business/me/account",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert forbidden.status_code == 403

    reset_request = client.post(
        "/auth/password-reset/request",
        json={"email": "customer@example.com"},
    )
    assert reset_request.status_code == 200
    assert "token" not in reset_request.json()["message"].lower()
    reset_token = caplog.text.rsplit(": ", 1)[-1].strip()
    reset = client.post(
        "/auth/password-reset/confirm",
        json={"reset_token": reset_token, "new_password": "New-Correct-Password-2"},
    )
    assert reset.status_code == 200, reset.text
    assert client.post(
        "/auth/login",
        json={"email": "customer@example.com", "password": "New-Correct-Password-2"},
    ).status_code == 200
    assert client.post(
        "/auth/password-reset/request",
        json={"email": "unknown@example.com"},
    ).json() == reset_request.json()


def test_business_verification_catalog_and_customer_flows(client):
    register_admin()
    admin_headers = login_headers(client)
    business_headers = {
        "Authorization": f"Bearer {register_business(client)}",
    }

    category_response = client.post(
        "/admin/categories",
        headers=admin_headers,
        json={"name": "Event Planning", "description": "Event service providers"},
    )
    assert category_response.status_code == 201, category_response.text
    category_id = category_response.json()["id"]
    duplicate_category = client.post(
        "/admin/categories",
        headers=admin_headers,
        json={"name": "event planning"},
    )
    assert duplicate_category.status_code == 409
    category_patch = client.patch(
        f"/admin/categories/{category_id}",
        headers=admin_headers,
        json={"description": "Updated description"},
    )
    assert category_patch.status_code == 200

    profile_response = client.post(
        "/business/me/profile",
        headers=business_headers,
        json={"description": "Planning weddings and community events", "category_ids": [category_id]},
    )
    assert profile_response.status_code == 201, profile_response.text
    business_id = profile_response.json()["business_account_id"]
    assert profile_response.json()["verification_status"] == "pending"
    assert client.post(
        "/business/me/profile",
        headers=business_headers,
        json={"description": "Duplicate profile"},
    ).status_code == 409

    blocked_publish = client.patch(
        "/business/me/profile",
        headers=business_headers,
        json={"is_published": True},
    )
    assert blocked_publish.status_code == 409

    service_response = client.post(
        "/business/me/profile/services",
        headers=business_headers,
        json={"name": "Full planning", "price": "250.00", "currency": "USD"},
    )
    assert service_response.status_code == 201, service_response.text
    service_id = service_response.json()["id"]

    image_response = client.post(
        "/business/me/profile/portfolio",
        headers=business_headers,
        json={"image_url": "https://example.com/portfolio.jpg", "caption": "Recent event"},
    )
    assert image_response.status_code == 201, image_response.text

    hidden = client.get("/businesses")
    assert hidden.status_code == 200
    assert hidden.json() == []

    verification_response = client.post(
        "/business/me/verification",
        headers=business_headers,
        json={"decision_reason": "Business registration document submitted"},
    )
    assert verification_response.status_code == 201, verification_response.text
    assert client.post(
        "/business/me/verification",
        headers=business_headers,
        json={},
    ).status_code == 409
    queue_response = client.get("/admin/verifications", headers=admin_headers)
    assert queue_response.status_code == 200, queue_response.text
    assert len(queue_response.json()) == 1
    record_id = queue_response.json()[0]["record_id"]

    decision = client.post(
        f"/admin/verifications/{record_id}/decision",
        headers=admin_headers,
        json={"status": "approved", "decision_reason": "Documents verified"},
    )
    assert decision.status_code == 200, decision.text

    published = client.patch(
        "/business/me/profile",
        headers=business_headers,
        json={"is_published": True},
    )
    assert published.status_code == 200, published.text

    search = client.get(
        "/businesses",
        params={
            "q": "weddings",
            "city": "Kathmandu",
            "category_id": category_id,
            "min_price": "200",
            "max_price": "300",
        },
    )
    assert search.status_code == 200, search.text
    assert len(search.json()) == 1
    listing = search.json()[0]
    assert listing["business"]["id"] == business_id
    assert listing["review_count"] == 0
    assert listing["profile"]["services"][0]["id"] == service_id
    assert len(listing["profile"]["portfolio_images"]) == 1

    customer_token = register_customer(client)
    customer_headers = {"Authorization": f"Bearer {customer_token}"}
    preferences = client.patch(
        "/customers/me/profile",
        headers=customer_headers,
        json={
            "preferences": {
                "category_ids": [category_id],
                "location_city": "Kathmandu",
                "location_country": "Nepal",
                "max_price": "300",
            }
        },
    )
    assert preferences.status_code == 200, preferences.text

    recommendations = client.get("/customers/me/recommendations", headers=customer_headers)
    assert recommendations.status_code == 200, recommendations.text
    assert recommendations.json()[0]["business"]["business"]["id"] == business_id

    save = client.put(
        f"/customers/me/saved-businesses/{business_id}",
        headers=customer_headers,
    )
    assert save.status_code == 204
    assert client.put(
        f"/customers/me/saved-businesses/{business_id}",
        headers=customer_headers,
    ).status_code == 204
    saved = client.get("/customers/me/saved-businesses", headers=customer_headers)
    assert saved.status_code == 200, saved.text
    assert len(saved.json()) == 1

    review = client.post(
        f"/businesses/{business_id}/reviews",
        headers=customer_headers,
        json={"rating": 5, "comment_text": "Excellent service"},
    )
    assert review.status_code == 201, review.text
    assert client.post(
        f"/businesses/{business_id}/reviews",
        headers=customer_headers,
        json={"rating": 4},
    ).status_code == 409
    review_id = review.json()["id"]
    updated_review = client.patch(
        f"/businesses/{business_id}/reviews/me",
        headers=customer_headers,
        json={"rating": 4, "comment_text": "Very good"},
    )
    assert updated_review.status_code == 200
    assert updated_review.json()["id"] == review_id

    review_list = client.get(f"/businesses/{business_id}/reviews")
    assert review_list.status_code == 200, review_list.text
    assert review_list.json()["total"] == 1
    assert review_list.json()["average_rating"] == 4.0

    interaction = client.post(
        f"/businesses/{business_id}/interactions",
        headers=customer_headers,
        json={"interaction_type": "contact", "consent_flag": True},
    )
    assert interaction.status_code == 201, interaction.text
    dashboard = client.get("/customers/me/dashboard", headers=customer_headers)
    assert dashboard.status_code == 200
    assert dashboard.json()["review_count"] == 1
    assert dashboard.json()["saved_business_count"] == 1
    business_dashboard = client.get("/business/me/dashboard", headers=business_headers)
    assert business_dashboard.status_code == 200, business_dashboard.text
    assert business_dashboard.json()["average_rating"] == 4.0
    assert business_dashboard.json()["contacts_30_days"] == 1

    assert client.patch(
        f"/business/me/profile/services/{service_id}",
        headers=business_headers,
        json={"price": "275.00"},
    ).status_code == 200
    assert len(client.get("/business/me/profile/services", headers=business_headers).json()) == 1
    assert client.delete(
        f"/business/me/profile/services/{service_id}",
        headers=business_headers,
    ).status_code == 204
    image_id = listing["profile"]["portfolio_images"][0]["id"]
    assert client.delete(
        f"/business/me/profile/portfolio/{image_id}",
        headers=business_headers,
    ).status_code == 204
    assert client.delete(
        f"/businesses/{business_id}/reviews/me",
        headers=customer_headers,
    ).status_code == 204
    assert client.get(f"/businesses/{business_id}/reviews").json()["total"] == 0
    assert client.delete(
        f"/customers/me/saved-businesses/{business_id}",
        headers=customer_headers,
    ).status_code == 204
    assert client.get("/customers/me/saved-businesses", headers=customer_headers).json() == []
    assert client.delete(
        f"/admin/categories/{category_id}",
        headers=admin_headers,
    ).status_code == 200


def test_database_health_and_admin_authorization(client):
    root = client.get("/")
    assert root.status_code == 200
    health = client.get("/health")
    assert health.status_code == 200, health.text
    assert health.json() == {"status": "ok", "database": "ok"}

    customer_headers = {
        "Authorization": f"Bearer {register_customer(client)}",
    }
    forbidden = client.get("/admin/verifications", headers=customer_headers)
    assert forbidden.status_code == 403

    unauthorized = client.get("/admin/verifications")
    assert unauthorized.status_code == 403 or unauthorized.status_code == 401
