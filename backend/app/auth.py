"""JWT utilities and password hashing."""
from __future__ import annotations

import os
from datetime import datetime, timedelta

import bcrypt
from jose import jwt
from pydantic import BaseModel

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "vendorlens-dev-secret-change-in-prod")
ALGORITHM  = os.getenv("JWT_ALGORITHM", "HS256")
EXPIRY_MIN = int(os.getenv("JWT_EXPIRY_MINUTES", "60"))


class UserOut(BaseModel):
    id: int
    email: str
    role: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    email: str


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(user_id: int, email: str, role: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=EXPIRY_MIN)
    payload = {"sub": str(user_id), "email": email, "role": role, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and verify a JWT. Raises jose.JWTError on failure."""
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
