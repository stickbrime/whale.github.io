"""Store configuration shared by the storefront and the volunteer console.

Settings live in the ``store_settings`` key/value table so volunteers can
change opening hours, cup quotas and balance limits from the dashboard
without a redeploy. Defaults mirror the original Whale platform.
"""

from datetime import date, datetime, time
from decimal import Decimal
from typing import Dict, Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import models, schemas

# key -> (default string value, parser)
_DEFAULTS: Dict[str, str] = {
    "store_open": "true",
    "weekdays_only": "false",
    "open_time": "07:00",
    "close_time": "23:00",
    "pre_order_start_time": "10:00",
    "maximum_cups_per_order": "6",
    "maximum_cups_per_day": "100",
    "maximum_pre_order_cups_per_day": "0",
    "maximum_balance": "500.00",
    "balance_recharge_minimum": "20.00",
    "allow_pay_later": "true",
    "allow_delivery": "true",
    "announcement": "",
}

_BOOL_KEYS = {
    "store_open",
    "weekdays_only",
    "allow_pay_later",
    "allow_delivery",
}
_INT_KEYS = {
    "maximum_cups_per_order",
    "maximum_cups_per_day",
    "maximum_pre_order_cups_per_day",
}
_DECIMAL_KEYS = {"maximum_balance", "balance_recharge_minimum"}


def _as_bool(value: str, fallback: bool) -> bool:
    lowered = (value or "").strip().lower()
    if lowered in ("1", "true", "yes", "on"):
        return True
    if lowered in ("0", "false", "no", "off"):
        return False
    return fallback


def _raw_settings(db: Session) -> Dict[str, str]:
    values = dict(_DEFAULTS)
    rows = db.scalars(select(models.StoreSetting)).all()
    for row in rows:
        if row.key in values:
            values[row.key] = row.value
    return values


def load_settings(db: Session) -> schemas.StoreSettingsRead:
    """Read every setting, falling back to the documented defaults."""
    raw = _raw_settings(db)
    return schemas.StoreSettingsRead(
        store_open=_as_bool(raw["store_open"], True),
        weekdays_only=_as_bool(raw["weekdays_only"], True),
        open_time=raw["open_time"],
        close_time=raw["close_time"],
        pre_order_start_time=raw["pre_order_start_time"],
        maximum_cups_per_order=int(raw["maximum_cups_per_order"]),
        maximum_cups_per_day=int(raw["maximum_cups_per_day"]),
        maximum_pre_order_cups_per_day=int(raw["maximum_pre_order_cups_per_day"]),
        maximum_balance=Decimal(raw["maximum_balance"]),
        balance_recharge_minimum=Decimal(raw["balance_recharge_minimum"]),
        allow_pay_later=_as_bool(raw["allow_pay_later"], True),
        allow_delivery=_as_bool(raw["allow_delivery"], True),
        announcement=raw["announcement"],
    )


def save_settings(
    db: Session, payload: schemas.StoreSettingsUpdate
) -> schemas.StoreSettingsRead:
    """Persist only the keys the caller supplied."""
    changes = payload.model_dump(exclude_unset=True, exclude_none=True)
    for key, value in changes.items():
        if key not in _DEFAULTS:
            continue
        if key in _BOOL_KEYS:
            stored = "true" if value else "false"
        elif key in _DECIMAL_KEYS:
            stored = str(Decimal(value).quantize(Decimal("0.01")))
        else:
            stored = str(value)

        row = db.get(models.StoreSetting, key)
        if row is None:
            db.add(models.StoreSetting(key=key, value=stored))
        else:
            row.value = stored

    db.commit()
    return load_settings(db)


def _parse_time(value: str) -> time:
    hour, minute = value.split(":")
    return time(int(hour), int(minute))


def evaluate_store_status(db: Session, now: Optional[datetime] = None) -> schemas.StoreStatus:
    """Decide whether new orders are accepted right now."""
    settings = load_settings(db)
    now = now or datetime.now()

    reason: Optional[str] = None
    if not settings.store_open:
        reason = "closed_manually"
    elif settings.weekdays_only and now.weekday() >= 5:
        reason = "closed_weekend"
    else:
        current = now.time()
        if current < _parse_time(settings.open_time):
            reason = "before_opening"
        elif current > _parse_time(settings.close_time):
            reason = "after_closing"

    return schemas.StoreStatus(
        open=reason is None,
        reason=reason,
        settings=settings,
    )


def cups_sold_today(db: Session, now: Optional[datetime] = None) -> int:
    """Total cups ordered today, excluding cancelled orders."""
    now = now or datetime.now()
    start = datetime(now.year, now.month, now.day)
    total = db.scalar(
        select(func.coalesce(func.sum(models.OrderItem.quantity), 0))
        .select_from(models.OrderItem)
        .join(models.Order, models.OrderItem.order_id == models.Order.order_id)
        .where(
            models.Order.order_date >= start,
            models.Order.payment_status != "cancelled",
        )
    )
    return int(total or 0)


def enforce_order_rules(
    db: Session,
    item_quantities: Dict[int, int],
    *,
    scheduled: bool = False,
    now: Optional[datetime] = None,
) -> None:
    """Apply storefront rules to a new order. Raises 409 with a readable reason."""
    store = evaluate_store_status(db, now)
    if not store.open:
        messages = {
            "closed_manually": "The store is closed right now.",
            "closed_weekend": "The store only takes orders on weekdays.",
            "before_opening": f"The store opens at {store.settings.open_time}.",
            "after_closing": f"The store closed at {store.settings.close_time}.",
        }
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=messages.get(store.reason or "", "The store is closed right now."),
        )

    requested_cups = sum(item_quantities.values())
    if requested_cups > store.settings.maximum_cups_per_order:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"At most {store.settings.maximum_cups_per_order} cups per order "
                f"(requested {requested_cups})."
            ),
        )

    limit = (
        store.settings.maximum_pre_order_cups_per_day
        if scheduled
        else store.settings.maximum_cups_per_day
    )
    if limit > 0 and cups_sold_today(db, now) + requested_cups > limit:
        remaining = max(limit - cups_sold_today(db, now), 0)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Only {remaining} cups are left for today (daily limit {limit}).",
        )


def record_audit(
    db: Session,
    actor_customer_id: Optional[int],
    action: str,
    target: Optional[str] = None,
    detail: Optional[str] = None,
) -> models.AuditLog:
    """Append an audit row; callers commit alongside their main change."""
    entry = models.AuditLog(
        actor_customer_id=actor_customer_id,
        action=action,
        target=target,
        detail=detail,
    )
    db.add(entry)
    return entry


def add_balance_entry(
    db: Session,
    customer: models.Customer,
    amount: Decimal,
    kind: str,
    note: Optional[str] = None,
    order_id: Optional[int] = None,
) -> models.BalanceTransaction:
    """Apply a signed balance delta and write the ledger row."""
    entry = models.BalanceTransaction(
        customer_id=customer.customer_id,
        amount=amount.quantize(Decimal("0.01")),
        kind=kind,
        note=note,
        order_id=order_id,
    )
    customer.balance = (Decimal(customer.balance) + amount).quantize(Decimal("0.01"))
    db.add(entry)
    return entry
