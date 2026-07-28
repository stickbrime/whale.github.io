"""Transactional order endpoints that calculate prices and maintain inventory."""

from decimal import Decimal
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, schemas
from app.api.common import get_or_404
from app.database import get_db


router = APIRouter(prefix="/orders", tags=["Orders"])

TERMINAL_STATUSES = {"failed", "refunded", "cancelled"}
ALLOWED_TRANSITIONS = {
    "pending": {"paid", "failed", "cancelled"},
    "paid": {"refunded", "cancelled"},
    "failed": set(),
    "refunded": set(),
    "cancelled": set(),
}


def restore_inventory(order: models.Order) -> None:
    for item in order.items:
        item.product.stock_quantity += item.quantity


@router.post("", response_model=schemas.OrderRead, status_code=status.HTTP_201_CREATED)
def create_order(payload: schemas.OrderCreate, db: Session = Depends(get_db)):
    get_or_404(db, models.Customer, payload.customer_id, "Customer")
    if payload.employee_id is not None:
        get_or_404(db, models.Employee, payload.employee_id, "Employee")

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
        payment_status=payload.payment_status.value,
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
    return order


@router.get("", response_model=List[schemas.OrderRead])
def list_orders(
    customer_id: Optional[int] = Query(default=None, gt=0),
    employee_id: Optional[int] = Query(default=None, gt=0),
    payment_status: Optional[schemas.PaymentStatus] = None,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    query = select(models.Order)
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


@router.patch("/{order_id}", response_model=schemas.OrderRead)
def update_order(order_id: int, payload: schemas.OrderUpdate, db: Session = Depends(get_db)):
    order = get_or_404(db, models.Order, order_id, "Order")
    changes = payload.model_dump(exclude_unset=True)

    if "employee_id" in changes and changes["employee_id"] is not None:
        get_or_404(db, models.Employee, changes["employee_id"], "Employee")
    if "employee_id" in changes:
        order.employee_id = changes["employee_id"]
    if "pickup_time" in changes:
        order.pickup_time = changes["pickup_time"]

    if changes.get("payment_status") is not None:
        new_status = changes["payment_status"].value
        current_status = order.payment_status
        if new_status != current_status:
            if new_status not in ALLOWED_TRANSITIONS[current_status]:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Payment status cannot change from {current_status} to {new_status}",
                )
            if new_status in TERMINAL_STATUSES and current_status not in TERMINAL_STATUSES:
                restore_inventory(order)
            order.payment_status = new_status

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
