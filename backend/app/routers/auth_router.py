"""
Auth endpoints:
  POST /auth/register — open registration (hackathon only).
                        Production: replace with invite-only or SSO.
  POST /auth/login    — JSON body → JWT (used by frontend)
  POST /auth/token    — form-data → JWT (used by Swagger /docs Authorize button)
  GET  /auth/me       — current user from token
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel

from ..auth import (
    TokenResponse, UserOut,
    create_access_token, hash_password, verify_password,
)
from ..db import create_user, get_user_by_email
from ..deps import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])

VALID_ROLES = {"ADMIN", "ANALYST", "AUDITOR"}


class RegisterRequest(BaseModel):
    email: str
    password: str
    role: str = "ANALYST"


class LoginRequest(BaseModel):
    email: str
    password: str


def _authenticate(email: str, password: str) -> dict:
    user = get_user_by_email(email)
    if not user or not verify_password(password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return dict(user)


def _validate_password(password: str) -> None:
    if len(password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    if not any(c.isupper() for c in password):
        raise HTTPException(400, "Password must contain at least one uppercase letter")
    if not any(c.isdigit() for c in password):
        raise HTTPException(400, "Password must contain at least one number")


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(req: RegisterRequest):
    """Open registration — in production this would be invite-only or via SSO."""
    role = req.role.upper()
    if role not in VALID_ROLES:
        raise HTTPException(400, f"role must be one of {sorted(VALID_ROLES)}")
    _validate_password(req.password)
    if get_user_by_email(req.email):
        raise HTTPException(400, "Email already registered")
    uid = create_user(req.email, hash_password(req.password), role)
    return UserOut(id=uid, email=req.email, role=role)


@router.post("/login", response_model=TokenResponse)
def login_json(req: LoginRequest):
    """JSON login — used by the React frontend."""
    user = _authenticate(req.email, req.password)
    token = create_access_token(user["id"], user["email"], user["role"])
    return TokenResponse(access_token=token, role=user["role"], email=user["email"])


@router.post("/token", response_model=TokenResponse, include_in_schema=False)
def login_form(form: Annotated[OAuth2PasswordRequestForm, Depends()]):
    """Form-data login — used by Swagger /docs Authorize button."""
    user = _authenticate(form.username, form.password)
    token = create_access_token(user["id"], user["email"], user["role"])
    return TokenResponse(access_token=token, role=user["role"], email=user["email"])


@router.get("/me", response_model=UserOut)
def me(user: Annotated[UserOut, Depends(get_current_user)]):
    return user
