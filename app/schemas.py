from datetime import datetime
from pydantic import BaseModel, EmailStr, ConfigDict
from .models import UserRole

class UserCreate(BaseModel):
    full_name: str
    email: EmailStr
    password: str
    role: UserRole = UserRole.customer

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str
    email: EmailStr
    role: UserRole
    is_verified: bool
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: str