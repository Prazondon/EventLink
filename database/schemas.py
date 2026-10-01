"""Public Pydantic schemas used by the API."""

from .init import *
from .init import UserRead

from pydantic import BaseModel, EmailStr, Field


class CustomerRegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    full_name: str = Field(min_length=1, max_length=150)


class BusinessRegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    business_name: str = Field(min_length=1, max_length=200)
    contact_phone: str | None = Field(default=None, max_length=30)
    location_city: str | None = Field(default=None, max_length=120)
    location_country: str | None = Field(default=None, max_length=120)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: str


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    reset_token: str = Field(min_length=1)
    new_password: str = Field(min_length=10, max_length=128)


class MessageResponse(BaseModel):
    message: str
