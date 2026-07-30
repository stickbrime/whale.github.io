"""OAuth2 login integration for BAID's SEIUE OneLogin service + manual email login."""

import base64
import secrets
from typing import Any, Dict, Optional
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.api.orders import customer_credit_status
from app.config import settings
from app.database import get_db


router = APIRouter(prefix="/auth", tags=["Authentication"])


def _current_customer(request: Request, db: Session):
    customer_id = request.session.get("customer_id")
    return db.get(models.Customer, customer_id) if customer_id else None


class ManualLoginRequest(BaseModel):
    email: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None


@router.post("/login/manual", response_model=schemas.Message)
def manual_login(body: ManualLoginRequest, request: Request, db: Session = Depends(get_db)):
    """Log in by email. If the customer exists, sign in as them.
    If not, create a new customer with the given details."""
    customer = db.scalar(select(models.Customer).where(models.Customer.email == body.email))
    if customer is None:
        if not body.first_name or not body.last_name:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No account found with that email. Provide first_name and last_name to create one.",
            )
        customer = models.Customer(
            first_name=body.first_name,
            last_name=body.last_name,
            email=body.email,
            phone=f"manual-{body.email.split('@')[0]}",
        )
        db.add(customer)
        db.commit()
        db.refresh(customer)
    request.session.clear()
    request.session["customer_id"] = customer.customer_id
    return {"message": "Signed in successfully"}


@router.get("/login")
def login(request: Request):
    if not settings.onelogin_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SEIUE OneLogin is not configured. Set ONELOGIN_CLIENT_ID and ONELOGIN_CLIENT_SECRET.",
        )
    state = secrets.token_urlsafe(32)
    request.session["oauth_state"] = state
    query = urlencode(
        {
            "client_id": settings.onelogin_client_id,
            "response_type": "code",
            "redirect_uri": settings.onelogin_redirect_uri,
            "scope": "basic",
            "state": state,
        }
    )
    return RedirectResponse(f"{settings.onelogin_base_url.rstrip('/')}/oauth2/authorize?{query}")


@router.get("/callback")
def callback(
    request: Request,
    code: str = "",
    state: str = "",
    error: str = "",
    db: Session = Depends(get_db),
):
    expected_state = request.session.pop("oauth_state", None)
    if error:
        return RedirectResponse(f"/account?auth_error={error}")
    if not code or not expected_state or not secrets.compare_digest(state, expected_state):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OAuth state")

    credentials = base64.b64encode(
        f"{settings.onelogin_client_id}:{settings.onelogin_client_secret}".encode()
    ).decode()
    try:
        with httpx.Client(timeout=15.0) as client:
            token_response = client.post(
                f"{settings.onelogin_base_url.rstrip('/')}/oauth2/token",
                headers={"Authorization": f"Basic {credentials}"},
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": settings.onelogin_redirect_uri,
                },
            )
            token_response.raise_for_status()
            access_token = token_response.json()["access_token"]
            me_response = client.get(
                f"{settings.onelogin_base_url.rstrip('/')}/api/v1/me",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            me_response.raise_for_status()
            profile: Dict[str, Any] = me_response.json()
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="SEIUE OneLogin authentication failed",
        ) from exc

    try:
        seiue_id = int(profile["seiueId"])
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="SEIUE OneLogin returned an invalid user profile",
        ) from exc
    customer = db.scalar(select(models.Customer).where(models.Customer.seiue_id == seiue_id))
    display_name = str(profile.get("name") or f"SEIUE {seiue_id}").strip()
    name_parts = display_name.split(maxsplit=1)
    first_name = name_parts[0]
    last_name = name_parts[1] if len(name_parts) > 1 else "Student"
    phone = str(profile.get("phone") or f"seiue-{seiue_id}")
    email = f"seiue-{seiue_id}@beijing.academy"
    if customer is None:
        customer = models.Customer(
            first_name=first_name,
            last_name=last_name,
            email=email,
            phone=phone,
            seiue_id=seiue_id,
        )
        db.add(customer)
    else:
        customer.first_name = first_name
        customer.last_name = last_name
        customer.phone = phone
    db.commit()
    db.refresh(customer)
    request.session.clear()
    request.session["customer_id"] = customer.customer_id
    return RedirectResponse("/account?login=success")


@router.get("/me", response_model=schemas.AuthStatus)
def me(request: Request, db: Session = Depends(get_db)):
    customer = _current_customer(request, db)
    return schemas.AuthStatus(
        authenticated=customer is not None,
        configured=settings.onelogin_configured,
        customer=customer,
        credit=customer_credit_status(db, customer.customer_id) if customer else None,
    )


@router.post("/logout", response_model=schemas.Message)
def logout(request: Request):
    request.session.clear()
    return {"message": "Signed out"}