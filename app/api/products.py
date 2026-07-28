"""Menu product CRUD and inventory endpoints."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import models, schemas
from app.api.common import commit_or_conflict, get_or_404
from app.database import get_db


router = APIRouter(prefix="/products", tags=["Products"])


def require_category(db: Session, category_id: int) -> None:
    get_or_404(db, models.Category, category_id, "Category")


@router.post("", response_model=schemas.ProductRead, status_code=status.HTTP_201_CREATED)
def create_product(payload: schemas.ProductCreate, db: Session = Depends(get_db)):
    require_category(db, payload.category_id)
    product = models.Product(**payload.model_dump())
    db.add(product)
    commit_or_conflict(db, "A product with this name already exists")
    db.refresh(product)
    return product


@router.get("", response_model=List[schemas.ProductRead])
def list_products(
    category_id: Optional[int] = Query(default=None, gt=0),
    search: Optional[str] = Query(default=None, min_length=1, max_length=100),
    in_stock: Optional[bool] = None,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    query = select(models.Product)
    if category_id is not None:
        query = query.where(models.Product.category_id == category_id)
    if search:
        pattern = f"%{search.strip().lower()}%"
        query = query.where(func.lower(models.Product.product_name).like(pattern))
    if in_stock is True:
        query = query.where(models.Product.stock_quantity > 0)
    elif in_stock is False:
        query = query.where(models.Product.stock_quantity == 0)
    return db.scalars(
        query.order_by(models.Product.product_name).offset(skip).limit(limit)
    ).all()


@router.get("/{product_id}", response_model=schemas.ProductRead)
def get_product(product_id: int, db: Session = Depends(get_db)):
    return get_or_404(db, models.Product, product_id, "Product")


@router.patch("/{product_id}", response_model=schemas.ProductRead)
def update_product(
    product_id: int, payload: schemas.ProductUpdate, db: Session = Depends(get_db)
):
    product = get_or_404(db, models.Product, product_id, "Product")
    changes = payload.model_dump(exclude_unset=True)
    if "category_id" in changes:
        require_category(db, changes["category_id"])
    for field, value in changes.items():
        setattr(product, field, value)
    commit_or_conflict(db, "The product name is already in use")
    db.refresh(product)
    return product


@router.patch("/{product_id}/stock", response_model=schemas.StockResponse)
def adjust_stock(
    product_id: int, payload: schemas.StockAdjustment, db: Session = Depends(get_db)
):
    product = get_or_404(db, models.Product, product_id, "Product")
    new_quantity = product.stock_quantity + payload.quantity_change
    if new_quantity < 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Stock cannot be negative; only {product.stock_quantity} units are available",
        )
    product.stock_quantity = new_quantity
    db.commit()
    db.refresh(product)
    return schemas.StockResponse(
        product_id=product.product_id, stock_quantity=product.stock_quantity
    )


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(product_id: int, db: Session = Depends(get_db)) -> Response:
    product = get_or_404(db, models.Product, product_id, "Product")
    db.delete(product)
    commit_or_conflict(db, "Products referenced by order history cannot be deleted")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
