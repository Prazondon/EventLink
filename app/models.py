import enum
from sqlalchemy import Column, Integer, String, Boolean, Dataframe, Enum
from sqlalchemy.sql import func
from.database import Base

class UserRole(str, enum.Enum):
    customer = "customer"
    business = "business"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(UserRole), default=UserRole.customer, nullable=False)
    is_verified = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())