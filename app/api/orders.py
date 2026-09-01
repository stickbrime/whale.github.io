"""Transactional order endpoints that calculate prices and maintain inventory."""

import os
import random
import re
import string
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app import models, schemas
from app.api.deps import require_admin
from app.api.common import get_or_404
from app.config import settings
from app.database import get_db
from app.receipt_printer import print_receipt


router = APIRouter(prefix="/orders", tags=["Orders"])

TERMINAL_STATUSES = {"failed", "refunded", "cancelled"}
ALLOWED_TRANSITIONS: Dict[str, set] = {
    "pending": {"paid", "failed", "cancelled"},
    "paid": {"refunded", "cancelled"},
    "failed": set(),
    "refunded": set(),
    "cancelled": set(),
}
CREDIT_LIMIT = Decimal("100.00")
_PICKUP_ALPHABET = "".join(c for c in string.ascii_uppercase + string.digits if c not in "0OI1")


def _generate_pickup_code(n: int = 6) -> str:
    return "".join(random.choice(_PICKUP_ALPHABET) for _ in range(n))


def restore_inventory(order: models.Order) -> None:
    for item in order.items:
        item.product.stock_quantity += item.quantity


def _transition_status(order: models.Order, new_status: str) -> None:
    """Validate + apply a payment_status transition; restore inventory on terminal states."""
    current_status = order.payment_status
    if new_status == current_status:
        return
    if new_status not in ALLOWED_TRANSITIONS[current_status]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Payment status cannot change from {current_status} to {new_status}",
        )
    if new_status in TERMINAL_STATUSES and current_status not in TERMINAL_STATUSES:
        restore_inventory(order)
    order.payment_status = new_status


def compute_customer_credit(db: Session, customer: models.Customer) -> schemas.CreditStatus:
    """Summarize all pending (tab/open) orders for a customer."""
    today = date.today()
    orders = db.scalars(
        select(models.Order)
        .where(
            models.Order.customer_id == customer.customer_id,
            models.Order.payment_status == "pending",
        )
        .order_by(models.Order.order_date.asc())
    ).all()

    overdue_ids: list[int] = []
    outstanding = Decimal("0")
    earliest_due_at: Optional[date] = None

    for order in orders:
        order_date = (
            order.order_date.date()
            if isinstance(order.order_date, datetime)
            else order.order_date
        )
        days = 7
        tab_note = ""
        for item in order.items:
            if item.customization:
                tab_note += item.customization
        match = re.search(r"\[Tab:\s*(\d+)\s*days\]", tab_note)
        if match:
            days = int(match.group(1))
        due = order_date + timedelta(days=days)
        if due < today:
            overdue_ids.append(order.order_id)
        outstanding += order.total_amount
        if earliest_due_at is None or due < earliest_due_at:
            earliest_due_at = due

    return schemas.CreditStatus(
        customer_id=customer.customer_id,
        locked=bool(overdue_ids) or outstanding >= CREDIT_LIMIT,
        overdue_orders=overdue_ids,
        outstanding_amount=outstanding,
        earliest_due_at=earliest_due_at,
    )


@router.post("", response_model=schemas.OrderRead, status_code=status.HTTP_201_CREATED)
def create_order(payload: schemas.OrderCreate, db: Session = Depends(get_db)):
    customer = get_or_404(db, models.Customer, payload.customer_id, "Customer")
    if payload.employee_id is not None:
        get_or_404(db, models.Employee, payload.employee_id, "Employee")

    credit = compute_customer_credit(db, customer)
    if credit.locked:
        reason = (
            f"overdue orders {credit.overdue_orders}"
            if credit.overdue_orders
            else f"outstanding balance ${credit.outstanding_amount}"
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Customer is locked ({reason}). Settle the tab before ordering again.",
        )

    product_ids = [item.product_id for item in payload.items]
    if len(product_ids) != len(set(product_ids)):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Each product may appear only once; increase its quantity instead",
        )

    products = db.scalars(
        select(models.Product).where(models.Product.product_id.in_(product_ids))
    ).all()
    products_by_id: Dict[int, models.Product] = {p.product_id: p for p in products}
    missing = sorted(set(product_ids) - set(products_by_id))
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Products not found: {missing}",
        )

    order = models.Order(
        customer_id=payload.customer_id,
        employee_id=payload.employee_id,
        pickup_time=payload.pickup_time,
        payment_method=payload.payment_method.value,
        payment_status=payload.payment_status.value,
        pickup_code=_generate_pickup_code(),
        total_amount=Decimal("0.00"),
    )
    total = Decimal("0.00")
    for requested_item in payload.items:
        product = products_by_id[requested_item.product_id]
        if product.stock_quantity < requested_item.quantity:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Insufficient stock for {product.product_name}: requested "
                    f"{requested_item.quantity}, available {product.stock_quantity}"
                ),
            )
        unit_price = Decimal(product.price).quantize(Decimal("0.01"))
        subtotal = (unit_price * requested_item.quantity).quantize(Decimal("0.01"))
        product.stock_quantity -= requested_item.quantity
        total += subtotal
        order.items.append(
            models.OrderItem(
                product=product,
                quantity=requested_item.quantity,
                unit_price=unit_price,
                subtotal=subtotal,
                customization=requested_item.customization,
            )
        )
    order.total_amount = total.quantize(Decimal("0.01"))
    db.add(order)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The order could not be created because related data changed",
        ) from exc
    db.refresh(order)
    result = print_receipt(
        shop_name=settings.printer_shop_name,
        order_id=order.order_id,
        order_date=order.order_date,
        customer_name=order.customer_name,
        items=order.items,
        total=order.total_amount,
        payment_method=order.payment_method,
        payment_status=order.payment_status,
        pickup_code=order.pickup_code,
        pickup_time=order.pickup_time.strftime("%H:%M") if order.pickup_time else None,
    )
    response = schemas.OrderRead.model_validate(order)
    response.print_status = result["status"]
    response.receipt_preview = result.get("receipt_preview")
    return response


@router.get("/customers/{customer_id}/credit-status", response_model=schemas.CreditStatus)
def get_customer_credit(customer_id: int, db: Session = Depends(get_db)):
    customer = get_or_404(db, models.Customer, customer_id, "Customer")
    return compute_customer_credit(db, customer)


@router.get("", response_model=List[schemas.OrderRead])
def list_orders(
    customer_id: Optional[int] = Query(default=None, gt=0),
    employee_id: Optional[int] = Query(default=None, gt=0),
    payment_status: Optional[schemas.PaymentStatus] = None,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    query = select(models.Order).options(selectinload(models.Order.customer))
    if customer_id is not None:
        query = query.where(models.Order.customer_id == customer_id)
    if employee_id is not None:
        query = query.where(models.Order.employee_id == employee_id)
    if payment_status is not None:
        query = query.where(models.Order.payment_status == payment_status.value)
    return db.scalars(
        query.order_by(models.Order.order_date.desc(), models.Order.order_id.desc())
        .offset(skip)
        .limit(limit)
    ).all()


@router.get("/{order_id}", response_model=schemas.OrderRead)
def get_order(order_id: int, db: Session = Depends(get_db)):
    return get_or_404(db, models.Order, order_id, "Order")


@router.post("/customers/{customer_id}/settle-all", response_model=List[schemas.OrderRead])
def settle_all_customer_orders(customer_id: int, db: Session = Depends(get_db)):
    """Settle every pending order for a customer in one call.

    Used by the account page to clear the tab and unlock ordering.
    Returns the orders that were just transitioned to paid.
    """
    customer = get_or_404(db, models.Customer, customer_id, "Customer")
    pending = db.scalars(
        select(models.Order).where(
            models.Order.customer_id == customer_id,
            models.Order.payment_status == "pending",
        )
    ).all()

    updated: list[models.Order] = []
    for order in pending:
        _transition_status(order, "paid")
        if not order.pickup_code:
            order.pickup_code = _generate_pickup_code()
        updated.append(order)

    db.commit()
    for order in updated:
        db.refresh(order)
    return updated


@router.post("/{order_id}/pay", response_model=schemas.OrderRead)
def pay_order(
    order_id: int,
    payload: Optional[schemas.PaymentRequest] = None,
    db: Session = Depends(get_db),
):
    """Simulated payment gateway callback.

    In production this endpoint would verify a signed webhook from the PSP
    (WeChat / Alipay / Stripe). For now it flips a pending order to paid and
    returns the updated order so the storefront can refresh its view.
    """
    order = get_or_404(db, models.Order, order_id, "Order")

    if order.payment_status == schemas.PaymentStatus.paid.value:
        return order

    if order.payment_status != schemas.PaymentStatus.pending.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot pay an order in status '{order.payment_status}'",
        )

    _transition_status(order, schemas.PaymentStatus.paid.value)
    if not order.pickup_code:
        order.pickup_code = _generate_pickup_code()
    db.commit()
    db.refresh(order)
    return order


@router.patch("/{order_id}", response_model=schemas.OrderRead)
def update_order(order_id: int, payload: schemas.OrderUpdate, db: Session = Depends(get_db), _: None = Depends(require_admin)):
    order = get_or_404(db, models.Order, order_id, "Order")
    changes = payload.model_dump(exclude_unset=True)

    if "employee_id" in changes and changes["employee_id"] is not None:
        get_or_404(db, models.Employee, changes["employee_id"], "Employee")
    if "employee_id" in changes:
        order.employee_id = changes["employee_id"]
    if "pickup_time" in changes:
        order.pickup_time = changes["pickup_time"]

    if changes.get("payment_status") is not None:
        _transition_status(order, changes["payment_status"].value)

    db.commit()
    db.refresh(order)
    return order


@router.delete("/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_order(order_id: int, db: Session = Depends(get_db)) -> Response:
    order = get_or_404(db, models.Order, order_id, "Order")
    if order.payment_status not in TERMINAL_STATUSES:
        restore_inventory(order)
    db.delete(order)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
