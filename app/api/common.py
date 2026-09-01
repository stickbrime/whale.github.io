"""Shared route helpers."""

from typing import Any, Type

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session


def get_or_404(db: Session, model: Type[Any], object_id: int, label: str) -> Any:
    instance = db.get(model, object_id)
    if instance is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{label} {object_id} was not found",
        )
    return instance


def commit_or_conflict(db: Session, detail: str) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail) from exc
