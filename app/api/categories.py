"""Product category CRUD endpoints."""

from typing import List

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.api.common import commit_or_conflict, get_or_404
from app.database import get_db


router = APIRouter(prefix="/categories", tags=["Categories"])


@router.post("", response_model=schemas.CategoryRead, status_code=status.HTTP_201_CREATED)
def create_category(payload: schemas.CategoryCreate, db: Session = Depends(get_db)):
    category = models.Category(**payload.model_dump())
    db.add(category)
    commit_or_conflict(db, "A category with this name already exists")
    db.refresh(category)
    return category


@router.get("", response_model=List[schemas.CategoryRead])
def list_categories(db: Session = Depends(get_db)):
    return db.scalars(select(models.Category).order_by(models.Category.category_name)).all()


@router.get("/{category_id}", response_model=schemas.CategoryRead)
def get_category(category_id: int, db: Session = Depends(get_db)):
    return get_or_404(db, models.Category, category_id, "Category")


@router.put("/{category_id}", response_model=schemas.CategoryRead)
def update_category(
    category_id: int, payload: schemas.CategoryUpdate, db: Session = Depends(get_db)
):
    category = get_or_404(db, models.Category, category_id, "Category")
    category.category_name = payload.category_name
    commit_or_conflict(db, "A category with this name already exists")
    db.refresh(category)
    return category


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(category_id: int, db: Session = Depends(get_db)) -> Response:
    category = get_or_404(db, models.Category, category_id, "Category")
    db.delete(category)
    commit_or_conflict(db, "Categories containing products cannot be deleted")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
