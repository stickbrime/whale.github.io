"""Dependency-only helpers that MUST NOT import from app.api.*.

Keep this file free of any app.api submodule imports — auth.py, orders.py,
and products.py all depend on it, so it is the hub used to break the
otherwise circular auth ↔ orders dependency caused by require_admin.
"""

import base64
import json
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app import models
from app.database import get_db


ADMIN_COOKIE = "whale_admin"
CUSTOMER_COOKIE = "whale_customer"

# Permissions a volunteer can hold. ``admin.manage`` implies every other
# permission, mirroring the original Whale platform's permission model.
STAFF_PERMISSIONS = (
    "admin.manage",
    "orders.view",
    "orders.manage",
    "storefront.manage",
    "users.view",
    "users.manage",
    "settings.manage",
    "logs.view",
    "stats.view",
)


def encode_customer_id(customer_id: int) -> str:
    payload = json.dumps({"c": customer_id}).encode()
    return base64.urlsafe_b64encode(payload).decode().rstrip("=")


def decode_customer_id(token: str) -> Optional[int]:
    try:
        padded = token + "=" * (-len(token) % 4)
        decoded = base64.urlsafe_b64decode(padded)
        return json.loads(decoded).get("c")
    except Exception:
        return None


def is_admin(request: Request) -> bool:
    """Return True if the request carries a valid admin session cookie."""
    return request.cookies.get(ADMIN_COOKIE) == "1"


def require_admin(request: Request) -> None:
    """Dependency: ensure the caller is authenticated as admin."""
    if not is_admin(request):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin authentication required",
        )


def get_optional_customer(
    request: Request, db: Session = Depends(get_db)
) -> Optional[models.Customer]:
    """Resolve the customer cookie to a live row, if one exists."""
    token = request.cookies.get(CUSTOMER_COOKIE)
    if not token:
        return None
    customer_id = decode_customer_id(token)
    if customer_id is None:
        return None
    return db.get(models.Customer, customer_id)


def get_current_customer(
    request: Request, db: Session = Depends(get_db)
) -> models.Customer:
    """Dependency: require a logged-in, non-blocked customer."""
    customer = get_optional_customer(request, db)
    if customer is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Please sign in to continue",
        )
    if customer.blocked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been blocked",
        )
    return customer


def has_permission(customer: models.Customer, permission: str) -> bool:
    permissions = customer.permission_list
    if "admin.manage" in permissions:
        return True
    return permission in permissions


def require_permission(permission: str):
    """Build a dependency that gates a route behind one staff permission.

    The admin cookie always passes (it is the full-access operator session
    used by the existing admin dashboard).
    """

    def dependency(
        request: Request, db: Session = Depends(get_db)
    ) -> Optional[models.Customer]:
        if is_admin(request):
            return None
        customer = get_optional_customer(request, db)
        if customer is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Staff authentication required",
            )
        if customer.blocked:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This account has been blocked",
            )
        if not has_permission(customer, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing permission: {permission}",
            )
        return customer

    return dependency


def require_staff(request: Request, db: Session = Depends(get_db)) -> Optional[models.Customer]:
    """Dependency: any volunteer/staff member (or admin)."""
    if is_admin(request):
        return None
    customer = get_optional_customer(request, db)
    if customer is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Staff authentication required",
        )
    if customer.blocked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been blocked",
        )
    if customer.role not in ("staff", "admin") and not customer.permission_list:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Staff access required",
        )
    return customer
