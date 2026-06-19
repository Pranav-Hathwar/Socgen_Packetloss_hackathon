"""FastAPI dependency factories for authentication and role enforcement."""
from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError

from .auth import UserOut, decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")


def get_current_user(token: Annotated[str, Depends(oauth2_scheme)]) -> UserOut:
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        user_id = int(payload["sub"])
        email: str  = payload["email"]
        role: str   = payload["role"]
    except (JWTError, KeyError, ValueError):
        raise exc
    return UserOut(id=user_id, email=email, role=role)


def require_role(*roles: str):
    """Dependency factory: passes if user.role is in *roles, else 403."""
    allowed = set(roles)

    def _check(user: Annotated[UserOut, Depends(get_current_user)]) -> UserOut:
        if user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Role '{user.role}' cannot perform this action. "
                    f"Required: {', '.join(sorted(allowed))}."
                ),
            )
        return user

    return _check


# Convenience type aliases for route signatures
AnyUser        = Annotated[UserOut, Depends(get_current_user)]
AdminOrAnalyst = Annotated[UserOut, Depends(require_role("ADMIN", "ANALYST"))]
AdminOnly      = Annotated[UserOut, Depends(require_role("ADMIN"))]
