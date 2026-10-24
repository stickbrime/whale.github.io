"""Customer authentication endpoints.

Cookie-based sessions: the cookie stores a base64-encoded customer_id so the
storefront can identify the returning customer without a separate session
store. Four sign-in routes are supported:

* email  — lookup by email (creates the account on first sign-in)
* phone  — lookup by phone number for walk-in / external guests
* seiue  — LinkBAID/Seiue student SSO (real OAuth when configured)
* feishu / wechat — open-platform OAuth (requires app credentials)
"""

import hashlib
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.api.deps import (
    ADMIN_COOKIE,
    CUSTOMER_COOKIE,
    encode_customer_id,
    get_optional_customer,
    is_admin,
)
from app.config import settings
from app.database import get_db


router = APIRouter(prefix="/auth", tags=["Auth"])

COOKIE_NAME = CUSTOMER_COOKIE
COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

_ADMIN_USER = "admin"
_ADMIN_PASSWORD_HASH = hashlib.sha256(b"admin").hexdigest()

_STATE_COOKIE = "whale_oauth_state"


def _set_customer_cookie(response: Response, customer_id: int) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=encode_customer_id(customer_id),
        max_age=COOKIE_MAX_AGE_SECONDS,
        path="/",
        samesite="lax",
        httponly=True,
    )


def _ensure_login_allowed(customer: models.Customer) -> None:
    if customer.blocked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been blocked. Please contact the store.",
        )


def _split_name(full_name: str) -> tuple:
    parts = full_name.strip().split(" ", 1)
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], parts[1]


# ---------------------------------------------------------------------------
# Email / phone / student sign-in
# ---------------------------------------------------------------------------


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
        phone_tail = secrets.randbelow(100000)
        customer = models.Customer(
            first_name=payload.first_name,
            last_name=payload.last_name,
            email=payload.email,
            phone=f"auto-{phone_tail:05d}",
            auth_provider="email",
        )
        db.add(customer)
        db.commit()
        db.refresh(customer)

    _ensure_login_allowed(customer)
    _set_customer_cookie(response, customer.customer_id)
    return schemas.Message(message=f"Logged in as {customer.first_name} {customer.last_name}")


@router.post("/login/phone", response_model=schemas.Message)
def phone_login(
    payload: schemas.PhoneLoginRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    """Sign in external guests with an email-less phone account."""
    phone = payload.phone.strip()
    customer = db.scalar(select(models.Customer).where(models.Customer.phone == phone))

    if customer is None:
        if not payload.first_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No account for this phone; provide first_name to create one",
            )
        last_name = payload.last_name or ""
        customer = models.Customer(
            first_name=payload.first_name,
            last_name=last_name,
            email=f"phone-{phone}@guest.whalecafe.com",
            phone=phone,
            auth_provider="phone",
        )
        db.add(customer)
        db.commit()
        db.refresh(customer)

    _ensure_login_allowed(customer)
    _set_customer_cookie(response, customer.customer_id)
    return schemas.Message(message=f"Logged in as {customer.first_name} {customer.last_name}".strip())


@router.post("/login/student", response_model=schemas.Message)
def student_login(
    payload: schemas.StudentLoginRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    """Sign in a student by Seiue id.

    When LinkBAID OAuth is configured the frontend should use
    ``/auth/oauth/seiue/start`` instead; this endpoint is the fallback that
    works before credentials are supplied.
    """
    first_name, last_name = _split_name(payload.name)
    customer = db.scalar(
        select(models.Customer).where(models.Customer.seiue_id == payload.seiue_id)
    )

    if customer is None:
        phone = payload.phone or f"seiue-{payload.seiue_id}"
        customer = models.Customer(
            first_name=first_name,
            last_name=last_name,
            email=f"seiue-{payload.seiue_id}@student.whalecafe.com",
            phone=phone,
            auth_provider="seiue",
            seiue_id=payload.seiue_id,
            role="student",
        )
        db.add(customer)
        db.commit()
        db.refresh(customer)
    else:
        if payload.phone:
            customer.phone = payload.phone
        if not customer.last_name and last_name:
            customer.last_name = last_name
        db.commit()

    _ensure_login_allowed(customer)
    _set_customer_cookie(response, customer.customer_id)
    return schemas.Message(message=f"Logged in as {customer.first_name} {customer.last_name}".strip())


# ---------------------------------------------------------------------------
# Provider discovery + OAuth
# ---------------------------------------------------------------------------


@router.get("/providers", response_model=schemas.AuthProviders)
def auth_providers():
    """Report which sign-in methods have usable credentials configured."""
    return schemas.AuthProviders(
        providers=schemas.ProviderStatus(
            email=True,
            phone=True,
            seiue=settings.seiue_configured,
            feishu=settings.feishu_configured,
            wechat=settings.wechat_configured,
        ),
        message=None,
    )


_OAUTH_START_URLS = {
    "seiue": lambda state: (
        f"{settings.seiue_host.rstrip('/')}/oauth/authorize"
        f"?client_id={settings.seiue_client_id}"
        f"&redirect_uri={settings.public_base_url}/api/v1/auth/oauth/seiue/callback"
        f"&response_type=code&scope=basic%20phone%20sms&state={state}"
    ),
    "feishu": lambda state: (
        "https://open.feishu.cn/open-apis/authen/v1/authorize"
        f"?app_id={settings.feishu_app_id}"
        f"&redirect_uri={settings.public_base_url}/api/v1/auth/oauth/feishu/callback"
        f"&state={state}"
    ),
    "wechat": lambda state: (
        "https://open.weixin.qq.com/connect/qrconnect"
        f"?appid={settings.wechat_app_id}"
        f"&redirect_uri={settings.public_base_url}/api/v1/auth/oauth/wechat/callback"
        f"&response_type=code&scope=snsapi_login&state={state}#wechat_redirect"
    ),
}

_PROVIDER_ENABLED = {
    "seiue": lambda: settings.seiue_configured,
    "feishu": lambda: settings.feishu_configured,
    "wechat": lambda: settings.wechat_configured,
}


@router.get("/oauth/{provider}/start")
def oauth_start(provider: str, request: Request):
    """Redirect the browser to the provider's consent screen."""
    if provider not in _OAUTH_START_URLS:
        raise HTTPException(status_code=404, detail="Unknown sign-in provider")
    if not _PROVIDER_ENABLED[provider]():
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail=(
                f"{provider} sign-in is not configured yet. "
                "Add the provider credentials to the server environment."
            ),
        )
    state = secrets.token_urlsafe(24)
    redirect = RedirectResponse(_OAUTH_START_URLS[provider](state))
    redirect.set_cookie(
        key=_STATE_COOKIE,
        value=state,
        max_age=600,
        path="/",
        samesite="lax",
        httponly=True,
    )
    return redirect


@router.get("/oauth/{provider}/callback")
def oauth_callback(
    provider: str,
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Handle the provider callback.

    Token exchange requires live provider credentials, so this returns a
    clear 501 until they are supplied rather than pretending to succeed.
    """
    if provider not in _OAUTH_START_URLS:
        raise HTTPException(status_code=404, detail="Unknown sign-in provider")
    if not _PROVIDER_ENABLED[provider]():
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail=f"{provider} sign-in is not configured yet.",
        )
    return JSONResponse(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        content={
            "detail": (
                f"{provider} OAuth is configured but the token exchange has not "
                "been implemented yet. Please finish the integration with the "
                "provider credentials."
            ),
            "code_received": bool(code),
            "error": error,
        },
    )


# ---------------------------------------------------------------------------
# Session state
# ---------------------------------------------------------------------------


@router.get("/me", response_model=schemas.AuthStatus)
def auth_me(request: Request, db: Session = Depends(get_db)):
    customer = get_optional_customer(request, db)
    if customer is None:
        return schemas.AuthStatus(
            authenticated=False,
            configured=True,
            customer=None,
            credit=None,
        )

    from app.api.orders import compute_customer_credit

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
