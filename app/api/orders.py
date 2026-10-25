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

from app import models, schemas, store_settings
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
    from sqlalchemy.orm import object_session

    db = object_session(order)
    for item in order.items:
        variant = (
            db.get(models.ProductVariant, item.variant_id)
            if db is not None and item.variant_id
            else None
        )
        if variant is not None and variant.stock_quantity is not None:
            variant.stock_quantity += item.quantity
        else:
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
    if customer.blocked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been blocked. Please contact the store.",
        )
    if payload.employee_id is not None:
        get_or_404(db, models.Employee, payload.employee_id, "Employee")

    credit = compute_customer_credit(db, customer)
    if credit.locked:
        reason = (
            f"overdue orders {credit.overdue_orders}"
            if credit.overdue_orders
            else f"outstanding balance ¥{credit.outstanding_amount}"
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Customer is locked ({reason}). Settle the tab before ordering again.",
        )

    # Merge duplicate lines gracefully instead of rejecting with 422. Lines with
    # different variants are distinct because their unit prices differ.
    merged_items: Dict[tuple, schemas.OrderItemCreate] = {}
    for item in payload.items:
        key = (item.product_id, item.variant_id, item.temperature_variant_id)
        if key in merged_items:
            existing = merged_items[key]
            merged_items[key] = schemas.OrderItemCreate(
                product_id=item.product_id,
                variant_id=item.variant_id,
                temperature_variant_id=item.temperature_variant_id,
                quantity=min(existing.quantity + item.quantity, 100),
                customization=(
                    " · ".join(filter(None, [existing.customization, item.customization]))
                    or None
                ),
            )
        else:
            merged_items[key] = item
    payload.items = list(merged_items.values())

    # Staff placing an on-site order (employee_id set) bypass storefront
    # rules; self-service app orders must respect opening hours and quotas.
    if payload.employee_id is None:
        quantities: Dict[int, int] = {}
        for item in payload.items:
            quantities[item.product_id] = quantities.get(item.product_id, 0) + item.quantity
        store_settings.enforce_order_rules(
            db, quantities, scheduled=payload.pickup_time is not None
        )

    product_ids = [item.product_id for item in payload.items]

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

    variant_ids = [
        item.variant_id for item in payload.items if item.variant_id
    ] + [
        item.temperature_variant_id
        for item in payload.items
        if item.temperature_variant_id
    ]
    variants_by_id: Dict[int, models.ProductVariant] = {}
    if variant_ids:
        variants_by_id = {
            v.variant_id: v
            for v in db.scalars(
                select(models.ProductVariant).where(
                    models.ProductVariant.variant_id.in_(variant_ids)
                )
            ).all()
        }
        missing_variants = sorted(set(variant_ids) - set(variants_by_id))
        if missing_variants:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product variants not found: {missing_variants}",
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
        variant = (
            variants_by_id.get(requested_item.variant_id)
            if requested_item.variant_id
            else None
        )
        if variant is not None and variant.product_id != product.product_id:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Variant {variant.name} does not belong to {product.product_name}",
            )
        temperature = (
            variants_by_id.get(requested_item.temperature_variant_id)
            if requested_item.temperature_variant_id
            else None
        )
        if temperature is not None and (
            temperature.product_id != product.product_id
            or temperature.group_name != "Temperature"
        ):
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Temperature {temperature.name} does not belong to {product.product_name}",
            )

        available = (
            variant.stock_quantity
            if variant is not None and variant.stock_quantity is not None
            else product.stock_quantity
        )
        if available < requested_item.quantity:
            db.rollback()
            label = f"{product.product_name} ({variant.name})" if variant else product.product_name
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Insufficient stock for {label}: requested "
                    f"{requested_item.quantity}, available {available}"
                ),
            )
        unit_price = Decimal(product.price) + (
            Decimal(variant.price_delta) if variant is not None else Decimal("0.00")
        ) + (
            Decimal(temperature.price_delta) if temperature is not None else Decimal("0.00")
        )
        unit_price = unit_price.quantize(Decimal("0.01"))
        subtotal = (unit_price * requested_item.quantity).quantize(Decimal("0.01"))
        if variant is not None and variant.stock_quantity is not None:
            variant.stock_quantity -= requested_item.quantity
        else:
            product.stock_quantity -= requested_item.quantity
        total += subtotal
        order.items.append(
            models.OrderItem(
                product=product,
                quantity=requested_item.quantity,
                unit_price=unit_price,
                subtotal=subtotal,
                customization=requested_item.customization,
                variant_id=variant.variant_id if variant is not None else None,
                variant_name=variant.name if variant is not None else None,
                temperature_variant_id=(
                    temperature.variant_id if temperature is not None else None
                ),
                temperature_name=temperature.name if temperature is not None else None,
            )
        )
    order.total_amount = total.quantize(Decimal("0.01"))

    if order.payment_method == "pay_later":
        if not store_settings.load_settings(db).allow_pay_later:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Pay later is disabled right now. Please pay at checkout.",
            )
        order.payment_status = "pending"

    if order.payment_method == "balance":
        if Decimal(customer.balance) < order.total_amount:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Insufficient balance: available ¥{customer.balance}, "
                    f"required ¥{order.total_amount}"
                ),
            )
        # Wallet payments settle instantly and never enter the tab.
        order.payment_status = "paid"

    db.add(order)
    try:
        db.flush()
        if order.payment_method == "balance":
            store_settings.add_balance_entry(
                db,
                customer,
                -order.total_amount,
                "payment",
                note=f"Order #{order.order_id}",
                order_id=order.order_id,
            )
        store_settings.record_audit(
            db,
            customer.customer_id,
            "orderCreated",
            target=f"order:{order.order_id}",
            detail=f"¥{order.total_amount} via {order.payment_method}",
        )
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
    if "fulfillment_status" in changes and changes["fulfillment_status"] is not None:
        order.fulfillment_status = changes["fulfillment_status"]

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
