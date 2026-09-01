"""Customer CRUD endpoints."""

from typing import List

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.api.common import commit_or_conflict, get_or_404
from app.database import get_db


router = APIRouter(prefix="/customers", tags=["Customers"])


@router.post("", response_model=schemas.CustomerRead, status_code=status.HTTP_201_CREATED)
def create_customer(payload: schemas.CustomerCreate, db: Session = Depends(get_db)):
    customer = models.Customer(**payload.model_dump())
    db.add(customer)
    commit_or_conflict(db, "A customer with this email or phone already exists")
    db.refresh(customer)
    return customer


@router.get("", response_model=List[schemas.CustomerRead])
def list_customers(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    return db.scalars(
        select(models.Customer).order_by(models.Customer.customer_id).offset(skip).limit(limit)
    ).all()


@router.get("/{customer_id}", response_model=schemas.CustomerRead)
def get_customer(customer_id: int, db: Session = Depends(get_db)):
    return get_or_404(db, models.Customer, customer_id, "Customer")


@router.patch("/{customer_id}", response_model=schemas.CustomerRead)
def update_customer(
    customer_id: int, payload: schemas.CustomerUpdate, db: Session = Depends(get_db)
):
    customer = get_or_404(db, models.Customer, customer_id, "Customer")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(customer, field, value)
    commit_or_conflict(db, "The updated email or phone is already in use")
    db.refresh(customer)
    return customer


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_customer(customer_id: int, db: Session = Depends(get_db)) -> Response:
    customer = get_or_404(db, models.Customer, customer_id, "Customer")
    db.delete(customer)
    commit_or_conflict(db, "Customers with existing orders cannot be deleted")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{customer_id}/orders", response_model=List[schemas.OrderRead])
def list_customer_orders(customer_id: int, db: Session = Depends(get_db)):
    get_or_404(db, models.Customer, customer_id, "Customer")
    return db.scalars(
        select(models.Order)
        .where(models.Order.customer_id == customer_id)
        .order_by(models.Order.order_date.desc())
    ).all()
