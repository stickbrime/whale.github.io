"""Volunteer / staff console API.

Volunteers sign in with the normal customer cookie but must hold one of the
staff permissions (or the admin cookie). Every mutating call writes an
``audit_logs`` row so the store can see who changed what.
"""

from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app import models, schemas, store_settings
from app.api.deps import (
    STAFF_PERMISSIONS,
    require_permission,
    require_staff,
)
from app.api.common import get_or_404
from app.database import get_db


router = APIRouter(prefix="/staff", tags=["Staff"])


def _profile(db: Session, customer: Optional[models.Customer]) -> schemas.StaffProfile:
    if customer is None:
        return schemas.StaffProfile(
            customer_id=0,
            name="Administrator",
            email="admin@whale.local",
            role="admin",
            permissions=list(STAFF_PERMISSIONS),
            is_admin=True,
        )
    return schemas.StaffProfile(
        customer_id=customer.customer_id,
        name=f"{customer.first_name} {customer.last_name}".strip(),
        email=customer.email,
        role=customer.role,
        permissions=customer.permission_list,
        is_admin=False,
    )


@router.get("/me", response_model=schemas.StaffProfile)
def staff_me(
    customer: Optional[models.Customer] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    return _profile(db, customer)


# ---------------------------------------------------------------------------
# Live order queue
# ---------------------------------------------------------------------------


@router.get("/orders", response_model=List[schemas.OrderRead])
def staff_orders(
    fulfillment_status: Optional[str] = Query(default=None, pattern="^(waiting|done)$"),
    payment_status: Optional[schemas.PaymentStatus] = None,
    limit: int = Query(default=100, ge=1, le=300),
    customer: Optional[models.Customer] = Depends(require_permission("orders.view")),
    db: Session = Depends(get_db),
):
    query = select(models.Order)
    if fulfillment_status:
        query = query.where(models.Order.fulfillment_status == fulfillment_status)
    if payment_status is not None:
        query = query.where(models.Order.payment_status == payment_status.value)
    return db.scalars(
        query.order_by(models.Order.order_date.desc(), models.Order.order_id.desc()).limit(limit)
    ).all()


@router.post("/orders/{order_id}/fulfill", response_model=schemas.OrderRead)
def fulfill_order(
    order_id: int,
    customer: Optional[models.Customer] = Depends(require_permission("orders.manage")),
    db: Session = Depends(get_db),
):
    order = get_or_404(db, models.Order, order_id, "Order")
    if order.fulfillment_status == "done":
        return order

    order.fulfillment_status = "done"
    store_settings.record_audit(
        db,
        customer.customer_id if customer else None,
        "orderFulfilled",
        target=f"order:{order.order_id}",
        detail=f"pickup {order.pickup_code or '—'}",
    )
    db.commit()
    db.refresh(order)
    return order


@router.post("/orders/{order_id}/reopen", response_model=schemas.OrderRead)
def reopen_order(
    order_id: int,
    customer: Optional[models.Customer] = Depends(require_permission("orders.manage")),
    db: Session = Depends(get_db),
):
    order = get_or_404(db, models.Order, order_id, "Order")
    order.fulfillment_status = "waiting"
    store_settings.record_audit(
        db,
        customer.customer_id if customer else None,
        "orderReopened",
        target=f"order:{order.order_id}",
    )
    db.commit()
    db.refresh(order)
    return order


# ---------------------------------------------------------------------------
# Storefront settings
# ---------------------------------------------------------------------------


@router.get("/settings", response_model=schemas.StoreSettingsRead)
def read_settings(
    customer: Optional[models.Customer] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    return store_settings.load_settings(db)


@router.patch("/settings", response_model=schemas.StoreSettingsRead)
def update_settings(
    payload: schemas.StoreSettingsUpdate,
    customer: Optional[models.Customer] = Depends(require_permission("settings.manage")),
    db: Session = Depends(get_db),
):
    updated = store_settings.save_settings(db, payload)
    store_settings.record_audit(
        db,
        customer.customer_id if customer else None,
        "settingsUpdated",
        target="store_settings",
        detail=", ".join(payload.model_dump(exclude_unset=True).keys()),
    )
    db.commit()
    return updated


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------


@router.get("/users", response_model=List[schemas.StaffCustomerRead])
def list_users(
    search: Optional[str] = Query(default=None, max_length=120),
    limit: int = Query(default=100, ge=1, le=300),
    _: Optional[models.Customer] = Depends(require_permission("users.view")),
    db: Session = Depends(get_db),
):
    query = select(models.Customer)
    if search:
        needle = f"%{search.strip()}%"
        query = query.where(
            or_(
                models.Customer.first_name.ilike(needle),
                models.Customer.last_name.ilike(needle),
                models.Customer.email.ilike(needle),
                models.Customer.phone.ilike(needle),
            )
        )
    customers = db.scalars(query.order_by(models.Customer.customer_id.desc()).limit(limit)).all()

    counts = dict(
        db.execute(
            select(models.Order.customer_id, func.count(models.Order.order_id))
            .where(models.Order.customer_id.in_([c.customer_id for c in customers] or [0]))
            .group_by(models.Order.customer_id)
        ).all()
    )
    result: List[schemas.StaffCustomerRead] = []
    for entry in customers:
        item = schemas.StaffCustomerRead.model_validate(entry)
        item.order_count = int(counts.get(entry.customer_id, 0))
        result.append(item)
    return result


@router.patch("/users/{customer_id}", response_model=schemas.StaffCustomerRead)
def update_user(
    customer_id: int,
    payload: schemas.StaffUserUpdate,
    actor: Optional[models.Customer] = Depends(require_permission("users.manage")),
    db: Session = Depends(get_db),
):
    entry = get_or_404(db, models.Customer, customer_id, "Customer")
    changes = payload.model_dump(exclude_unset=True, exclude_none=True)

    if "role" in changes:
        entry.role = changes["role"]
    if "permissions" in changes:
        invalid = [p for p in changes["permissions"] if p not in STAFF_PERMISSIONS]
        if invalid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown permissions: {invalid}",
            )
        entry.permissions = ",".join(changes["permissions"])
    if "blocked" in changes:
        entry.blocked = 1 if changes["blocked"] else 0
    if "loyalty_points" in changes:
        entry.loyalty_points = changes["loyalty_points"]

    if changes.get("balance_delta") is not None:
        delta = Decimal(changes["balance_delta"]).quantize(Decimal("0.01"))
        if Decimal(entry.balance) + delta < 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Adjustment would make the balance negative",
            )
        store_settings.add_balance_entry(
            db,
            entry,
            delta,
            "adjustment",
            note=payload.note or "Staff adjustment",
        )

    store_settings.record_audit(
        db,
        actor.customer_id if actor else None,
        "userUpdated",
        target=f"customer:{entry.customer_id}",
        detail=", ".join(changes.keys()),
    )
    db.commit()
    db.refresh(entry)

    order_count = db.scalar(
        select(func.count(models.Order.order_id)).where(
            models.Order.customer_id == entry.customer_id
        )
    )
    result = schemas.StaffCustomerRead.model_validate(entry)
    result.order_count = int(order_count or 0)
    return result


@router.post("/users/{customer_id}/charge", response_model=schemas.StaffCustomerRead)
def charge_customer(
    customer_id: int,
    payload: schemas.StaffChargeRequest,
    actor: Optional[models.Customer] = Depends(require_permission("orders.manage")),
    db: Session = Depends(get_db),
):
    """Deduct an amount from a customer's wallet on their behalf.

    The signed ledger row is written to ``balance_transactions`` so the charge
    also appears in the customer's own wallet history.
    """
    entry = get_or_404(db, models.Customer, customer_id, "Customer")
    amount = payload.amount
    balance = Decimal(entry.balance).quantize(Decimal("0.01"))
    if balance < amount:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Insufficient balance: ¥{balance} available",
        )

    store_settings.add_balance_entry(
        db,
        entry,
        -amount,
        "payment",
        note=payload.note or "Volunteer charge",
    )
    store_settings.record_audit(
        db,
        actor.customer_id if actor else None,
        "balanceCharged",
        target=f"customer:{entry.customer_id}",
        detail=f"-¥{amount}" + (f" · {payload.note}" if payload.note else ""),
    )
    db.commit()
    db.refresh(entry)

    order_count = db.scalar(
        select(func.count(models.Order.order_id)).where(
            models.Order.customer_id == entry.customer_id
        )
    )
    result = schemas.StaffCustomerRead.model_validate(entry)
    result.order_count = int(order_count or 0)
    return result


# ---------------------------------------------------------------------------
# Audit trail
# ---------------------------------------------------------------------------


@router.get("/logs", response_model=List[schemas.AuditLogRead])
def list_logs(
    action: Optional[str] = Query(default=None, max_length=50),
    limit: int = Query(default=100, ge=1, le=500),
    _: Optional[models.Customer] = Depends(require_permission("logs.view")),
    db: Session = Depends(get_db),
):
    query = select(models.AuditLog)
    if action:
        query = query.where(models.AuditLog.action == action)
    return db.scalars(
        query.order_by(models.AuditLog.created_at.desc(), models.AuditLog.audit_log_id.desc()).limit(limit)
    ).all()


@router.get("/permissions")
def permission_catalog():
    """The permission strings the user editor can grant."""
    return {"permissions": list(STAFF_PERMISSIONS)}
