"""Manual cookie-based authentication endpoints.

This is intentionally lightweight — the cookie stores a base64-encoded
customer_id so the storefront can identify the returning customer without
a separate session store. For production, replace with a signed token
(JWT / OAuth) or a proper session backend.
"""

import base64
import hashlib
import json
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.api.deps import ADMIN_COOKIE, is_admin, require_admin
from app.api.orders import compute_customer_credit
from app.database import get_db


router = APIRouter(prefix="/auth", tags=["Auth"])

COOKIE_NAME = "whale_customer"
COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

_ADMIN_USER = "admin"
_ADMIN_PASSWORD_HASH = hashlib.sha256(b"admin").hexdigest()


def _encode_customer_id(customer_id: int) -> str:
    payload = json.dumps({"c": customer_id}).encode()
    return base64.urlsafe_b64encode(payload).decode().rstrip("=")


def _decode_customer_id(token: str) -> Optional[int]:
    try:
        padded = token + "=" * (-len(token) % 4)
        decoded = base64.urlsafe_b64decode(padded)
        return json.loads(decoded).get("c")
    except Exception:
        return None


def _authenticated_customer_id(request: Request) -> Optional[int]:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    return _decode_customer_id(token)


def _set_customer_cookie(response: Response, customer_id: int) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=_encode_customer_id(customer_id),
        max_age=COOKIE_MAX_AGE_SECONDS,
        path="/",
        samesite="lax",
        httponly=True,
    )


@router.post("/login/manual", response_model=schemas.Message)
def manual_login(
    payload: schemas.ManualLoginRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    """Look up (or create) a customer by email and set a cookie."""
    customer = db.scalar(
        select(models.Customer).where(models.Customer.email == payload.email)
    )

    if customer is None:
        if not payload.first_name or not payload.last_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Customer not found; provide first_name and last_name to create one",
            )
        phone_tail = abs(hash(payload.email)) % 100000
        customer = models.Customer(
            first_name=payload.first_name,
            last_name=payload.last_name,
            email=payload.email,
            phone=f"auto-{phone_tail:05d}",
        )
        db.add(customer)
        db.commit()
        db.refresh(customer)

    _set_customer_cookie(response, customer.customer_id)
    return schemas.Message(message=f"Logged in as {customer.first_name} {customer.last_name}")


@router.get("/me", response_model=schemas.AuthStatus)
def auth_me(request: Request, db: Session = Depends(get_db)):
    customer_id = _authenticated_customer_id(request)
    if customer_id is None:
        return schemas.AuthStatus(
            authenticated=False,
            configured=True,
            customer=None,
            credit=None,
        )

    customer = db.get(models.Customer, customer_id)
    if customer is None:
        return schemas.AuthStatus(
            authenticated=False,
            configured=True,
            customer=None,
            credit=None,
        )

    credit = compute_customer_credit(db, customer)
    return schemas.AuthStatus(
        authenticated=True,
        configured=True,
        customer=customer,
        credit=credit,
    )


@router.post("/logout", response_model=schemas.Message)
def logout(response: Response):
    response.delete_cookie(key=COOKIE_NAME, path="/")
    return schemas.Message(message="Logged out")


@router.post("/admin/login", response_model=schemas.Message)
def admin_login(payload: schemas.ManualLoginRequest, response: Response):
    if payload.email != _ADMIN_USER:
        raise HTTPException(status_code=401, detail="Invalid admin credentials")
    provided = hashlib.sha256((payload.last_name or "").encode()).hexdigest()
    if provided != _ADMIN_PASSWORD_HASH:
        raise HTTPException(status_code=401, detail="Invalid admin credentials")
    response.set_cookie(
        key=ADMIN_COOKIE,
        value="1",
        max_age=COOKIE_MAX_AGE_SECONDS,
        path="/",
        samesite="lax",
        httponly=True,
    )
    return schemas.Message(message="Admin logged in")


@router.get("/admin/status")
def admin_status(request: Request):
    return {"authenticated": is_admin(request)}


@router.post("/admin/logout", response_model=schemas.Message)
def admin_logout(response: Response):
    response.delete_cookie(key=ADMIN_COOKIE, path="/")
    return schemas.Message(message="Admin logged out")
