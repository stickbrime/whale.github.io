"""Public storefront status — opening hours, announcement and quotas."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import schemas, store_settings
from app.database import get_db


router = APIRouter(prefix="/store", tags=["Store"])


@router.get("/status", response_model=schemas.StoreStatus)
def store_status(db: Session = Depends(get_db)):
    """Whether new orders are currently accepted, plus the visible settings."""
    return store_settings.evaluate_store_status(db)
