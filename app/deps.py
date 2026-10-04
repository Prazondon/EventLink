from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from . import models
from .database import get_db
from .security import decode_access_token

oauth2_schema= OAuth2PasswordBearer(tokenUrl="auth/login")
def get_current_user(
        token: str= Depends(oauth2_schema),
        db: Session = Depends(get_db),

) -> models.User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},

    )
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception

    email = payload.get("sub")
    if email is None:
        raise credentials_exception

    user= db.query(models.User).filter(models.User.email ==email). first()
    if user is None:
        raise credentials_exception

    return user