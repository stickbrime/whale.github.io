"""Coupon CRUD, listing, and claim endpoints.

Public read endpoints expose the active coupon catalogue that the storefront
renders as a list. Claiming a coupon increments the server-side counter so that
``max_claims`` can be enforced; the storefront remembers which coupon a visitor
has claimed in ``localStorage`` and applies its discount on the shop tab.
"""

from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.api.common import commit_or_conflict, get_or_404
from app.api.deps import require_admin
from app.database import get_db


router = APIRouter(prefix="/coupons", tags=["Coupons"])


def _is_currently_valid(coupon: models.Coupon, today: Optional[date] = None) -> bool:
    """Return True when the coupon is within its active date window."""
    today = today or date.today()
    if coupon.valid_from is not None and today < coupon.valid_from:
        return False
    if coupon.valid_until is not None and today > coupon.valid_until:
        return False
    return True


def _remaining_claims(coupon: models.Coupon) -> Optional[int]:
    if coupon.max_claims is None:
        return None
    return max(0, coupon.max_claims - coupon.claimed_count)


def _to_read(coupon: models.Coupon) -> schemas.CouponRead:
    return schemas.CouponRead(
        coupon_id=coupon.coupon_id,
        code=coupon.code,
        title=coupon.title,
        description=coupon.description,
        discount_percent=coupon.discount_percent,
        is_active=bool(coupon.is_active),
        valid_from=coupon.valid_from,
        valid_until=coupon.valid_until,
        max_claims=coupon.max_claims,
        sort_order=coupon.sort_order,
        claimed_count=coupon.claimed_count,
        created_at=coupon.created_at,
        remaining_claims=_remaining_claims(coupon),
    )


@router.get("", response_model=List[schemas.CouponRead])
def list_coupons(
    active_only: bool = Query(
        default=True,
        description="Only return coupons that are active and within their valid date window.",
    ),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """List coupons. By default only active, currently-valid coupons are returned."""
    query = select(models.Coupon)
    if active_only:
        query = query.where(models.Coupon.is_active == 1)
    coupons = db.scalars(
        query.order_by(models.Coupon.sort_order, models.Coupon.coupon_id).offset(skip).limit(limit)
    ).all()
    result = [_to_read(c) for c in coupons]
    if active_only:
        result = [
            c
            for c in result
            if _is_currently_valid(c)
            and (c.remaining_claims is None or c.remaining_claims > 0)
        ]
    return result


@router.get("/{coupon_id}", response_model=schemas.CouponRead)
def get_coupon(coupon_id: int, db: Session = Depends(get_db)):
    return _to_read(get_or_404(db, models.Coupon, coupon_id, "Coupon"))


@router.post("", response_model=schemas.CouponRead, status_code=status.HTTP_201_CREATED)
def create_coupon(
    payload: schemas.CouponCreate,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    coupon = models.Coupon(**payload.model_dump())
    db.add(coupon)
    commit_or_conflict(db, "A coupon with this code already exists")
    db.refresh(coupon)
    return _to_read(coupon)


@router.patch("/{coupon_id}", response_model=schemas.CouponRead)
def update_coupon(
    coupon_id: int,
    payload: schemas.CouponUpdate,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    coupon = get_or_404(db, models.Coupon, coupon_id, "Coupon")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(coupon, field, value)
    commit_or_conflict(db, "The coupon code is already in use")
    db.refresh(coupon)
    return _to_read(coupon)


@router.post("/{coupon_id}/claim", response_model=schemas.CouponClaimResponse)
def claim_coupon(coupon_id: int, db: Session = Depends(get_db)):
    """Claim a coupon. Increments ``claimed_count`` and enforces ``max_claims``."""
    coupon = get_or_404(db, models.Coupon, coupon_id, "Coupon")
    if not coupon.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="This coupon is no longer active"
        )
    if not _is_currently_valid(coupon):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This coupon is not valid yet or has expired",
        )
    remaining = _remaining_claims(coupon)
    if remaining is not None and remaining <= 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This coupon has reached its claim limit",
        )
    coupon.claimed_count = (coupon.claimed_count or 0) + 1
    db.commit()
    db.refresh(coupon)
    return schemas.CouponClaimResponse(
        coupon_id=coupon.coupon_id,
        code=coupon.code,
        title=coupon.title,
        description=coupon.description,
        discount_percent=coupon.discount_percent,
        message="Coupon claimed successfully",
    )


@router.delete("/{coupon_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_coupon(
    coupon_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
) -> Response:
    coupon = get_or_404(db, models.Coupon, coupon_id, "Coupon")
    db.delete(coupon)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
