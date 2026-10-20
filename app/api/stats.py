"""Read-only market analytics — per-product sales summaries.

Aggregates are computed on-the-fly from ``order_items`` joined to ``orders``
so they stay correct as new orders arrive (the detail page polls every few
seconds). No new database table is required; this is a query layer over the
existing transactional schema.
"""

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import models, schemas
from app.api.common import get_or_404
from app.api.deps import require_admin
from app.database import get_db


router = APIRouter(prefix="/stats", tags=["Market stats"])

# Only paid (settled) orders count toward "sold" metrics — pending tabs have
# not been collected yet, and refunded/cancelled rows have had their stock
# restored. This matches what the storefront actually handed over.
COUNTED_STATUSES = ("paid",)

# How many days back the per-day timeseries chart goes.
TIMESERIES_DAYS = 14

# How many recent sale rows to surface on the detail page.
RECENT_SALES_LIMIT = 20

# Supported overview time ranges. Maps the query-param value to (days_back,
# granularity) where granularity is "hourly" | "daily" | "monthly".
RANGE_OPTIONS: Dict[str, tuple] = {
    "1d":   (1,    "hourly"),
    "7d":   (7,    "daily"),
    "30d":  (30,   "daily"),
    "90d":  (90,   "daily"),
    "365d": (365,  "monthly"),
    "all":  (None, "monthly"),
}
DEFAULT_RANGE = "7d"


def _build_overview_timeseries(
    db: Session, range_key: str
) -> list[schemas.OverviewTimeseriesPoint]:
    """Compute the zero-filled timeseries for the selected time range.

    Granularity adapts to the range: hourly for 1-day, daily for 7–90-day,
    monthly for 1-year and all-time so the chart stays readable regardless
    of how much history exists.
    """
    days_back, granularity = RANGE_OPTIONS.get(range_key, RANGE_OPTIONS[DEFAULT_RANGE])
    now = datetime.now()

    if granularity == "hourly":
        # 24 hourly buckets for today (00:00 – 23:00).
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        rows = db.execute(
            select(
                func.strftime("%H", models.Order.order_date).label("bucket"),
                func.coalesce(func.sum(models.OrderItem.quantity), 0).label("units"),
                func.coalesce(func.sum(models.OrderItem.subtotal), Decimal("0.00")).label("revenue"),
                func.count(models.OrderItem.order_id).label("orders"),
            )
            .select_from(models.OrderItem)
            .join(
                models.Order,
                (models.OrderItem.order_id == models.Order.order_id)
                & (models.Order.payment_status.in_(COUNTED_STATUSES)),
            )
            .where(models.Order.order_date >= today_start)
            .group_by("bucket")
            .order_by("bucket")
        ).mappings().all()
        by_bucket: dict[str, dict] = {
            str(r["bucket"]): {
                "units": int(r["units"]),
                "revenue": Decimal(r["revenue"]).quantize(Decimal("0.01")),
                "orders": int(r["orders"]),
            }
            for r in rows
        }
        result: list[schemas.OverviewTimeseriesPoint] = []
        for h in range(24):
            label = f"{h:02d}:00"
            b = by_bucket.get(f"{h:02d}", {"units": 0, "revenue": Decimal("0.00"), "orders": 0})
            result.append(schemas.OverviewTimeseriesPoint(day=label, **b))
        return result

    if granularity == "daily":
        start_date = (now - timedelta(days=days_back - 1)).date()
        rows = db.execute(
            select(
                func.date(models.Order.order_date).label("bucket"),
                func.coalesce(func.sum(models.OrderItem.quantity), 0).label("units"),
                func.coalesce(func.sum(models.OrderItem.subtotal), Decimal("0.00")).label("revenue"),
                func.count(models.OrderItem.order_id).label("orders"),
            )
            .select_from(models.OrderItem)
            .join(
                models.Order,
                (models.OrderItem.order_id == models.Order.order_id)
                & (models.Order.payment_status.in_(COUNTED_STATUSES)),
            )
            .where(func.date(models.Order.order_date) >= start_date)
            .group_by("bucket")
            .order_by("bucket")
        ).mappings().all()
        by_bucket = {
            str(r["bucket"]): {
                "units": int(r["units"]),
                "revenue": Decimal(r["revenue"]).quantize(Decimal("0.01")),
                "orders": int(r["orders"]),
            }
            for r in rows
        }
        result = []
        cursor = start_date
        today = date.today()
        while cursor <= today:
            b = by_bucket.get(cursor.isoformat(), {"units": 0, "revenue": Decimal("0.00"), "orders": 0})
            result.append(schemas.OverviewTimeseriesPoint(day=cursor.isoformat(), **b))
            cursor += timedelta(days=1)
        return result

    # granularity == "monthly"
    if days_back is not None:
        # Last N days → last 12 months.
        start_month = (now.replace(day=1) - timedelta(days=365)).date()
    else:
        # "all" → from the first order ever to now.
        first = db.scalar(select(func.min(models.Order.order_date)))
        start_month = first.date().replace(day=1) if first else now.date().replace(day=1)

    rows = db.execute(
        select(
            func.strftime("%Y-%m", models.Order.order_date).label("bucket"),
            func.coalesce(func.sum(models.OrderItem.quantity), 0).label("units"),
            func.coalesce(func.sum(models.OrderItem.subtotal), Decimal("0.00")).label("revenue"),
            func.count(models.OrderItem.order_id).label("orders"),
        )
        .select_from(models.OrderItem)
        .join(
            models.Order,
            (models.OrderItem.order_id == models.Order.order_id)
            & (models.Order.payment_status.in_(COUNTED_STATUSES)),
        )
        .where(func.strftime("%Y-%m", models.Order.order_date) >= func.strftime("%Y-%m", start_month))
        .group_by("bucket")
        .order_by("bucket")
    ).mappings().all()
    by_bucket = {
        str(r["bucket"]): {
            "units": int(r["units"]),
            "revenue": Decimal(r["revenue"]).quantize(Decimal("0.01")),
            "orders": int(r["orders"]),
        }
        for r in rows
    }

    # Walk month-by-month from start to current month.
    result = []
    cursor_year = start_month.year
    cursor_month = start_month.month
    now_year = now.year
    now_month = now.month
    while (cursor_year, cursor_month) <= (now_year, now_month):
        key = f"{cursor_year:04d}-{cursor_month:02d}"
        b = by_bucket.get(key, {"units": 0, "revenue": Decimal("0.00"), "orders": 0})
        # Human-friendly label: "Oct 2026"
        month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        label = f"{month_names[cursor_month - 1]} {cursor_year}"
        result.append(schemas.OverviewTimeseriesPoint(day=label, **b))
        cursor_month += 1
        if cursor_month > 12:
            cursor_month = 1
            cursor_year += 1
    return result


@router.get("/overview", response_model=schemas.MarketOverview)
def market_overview(
    range: str = Query(default=DEFAULT_RANGE),
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    """All-product market overview — KPIs + per-product sales breakdown."""

    # Aggregate per product over paid orders only.
    paid_items = (
        select(
            models.Product.product_id,
            models.Product.product_name,
            models.Product.price,
            models.Product.stock_quantity,
            models.Product.image_url,
            models.Category.category_name,
            func.coalesce(func.sum(models.OrderItem.quantity), 0).label("units_sold"),
            func.coalesce(func.sum(models.OrderItem.subtotal), Decimal("0.00")).label("revenue"),
            func.count(func.distinct(models.OrderItem.order_id)).label("order_count"),
            func.max(models.Order.order_date).label("last_sold_at"),
        )
        .select_from(models.Product)
        .outerjoin(models.Category, models.Product.category_id == models.Category.category_id)
        .outerjoin(
            models.OrderItem,
            (models.OrderItem.product_id == models.Product.product_id),
        )
        .outerjoin(
            models.Order,
            (models.OrderItem.order_id == models.Order.order_id)
            & (models.Order.payment_status.in_(COUNTED_STATUSES)),
        )
        .group_by(
            models.Product.product_id,
            models.Product.product_name,
            models.Product.price,
            models.Product.stock_quantity,
            models.Product.image_url,
            models.Category.category_name,
        )
        .order_by(func.coalesce(func.sum(models.OrderItem.subtotal), 0).desc())
    )
    rows = db.execute(paid_items).mappings().all()

    products: List[schemas.MarketProductStat] = []
    total_revenue = Decimal("0.00")
    total_units = 0

    for row in rows:
        revenue = Decimal(row["revenue"] or 0).quantize(Decimal("0.01"))
        units = int(row["units_sold"] or 0)
        total_revenue += revenue
        total_units += units
        products.append(
            schemas.MarketProductStat(
                product_id=row["product_id"],
                product_name=row["product_name"],
                category_name=row["category_name"],
                price=Decimal(row["price"]).quantize(Decimal("0.01")),
                stock_quantity=int(row["stock_quantity"]),
                image_url=row["image_url"],
                units_sold=units,
                revenue=revenue,
                order_count=int(row["order_count"] or 0),
                last_sold_at=row["last_sold_at"],
            )
        )

    # Distinct paid order ids across all products → total_orders.
    paid_order_ids = set(
        db.scalars(
            select(models.Order.order_id).where(
                models.Order.payment_status.in_(COUNTED_STATUSES)
            )
        ).all()
    )

    timeseries = _build_overview_timeseries(db, range)

    return schemas.MarketOverview(
        total_revenue=total_revenue.quantize(Decimal("0.01")),
        total_units=total_units,
        total_orders=len(paid_order_ids),
        paid_orders=len(paid_order_ids),
        product_count=len(products),
        products=products,
        timeseries=timeseries,
    )


@router.get("/products/{product_id}", response_model=schemas.ProductMarketDetail)
def product_market_detail(
    product_id: int,
    recent: int = Query(default=RECENT_SALES_LIMIT, ge=1, le=100),
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    """Per-product market sheet with KPIs, recent sales, and a 14-day chart."""

    product = get_or_404(db, models.Product, product_id, "Product")
    category_name = (
        db.scalar(
            select(models.Category.category_name).where(
                models.Category.category_id == product.category_id
            )
        )
        if product.category_id
        else None
    )

    # Aggregate sales for this product over paid orders.
    agg = db.execute(
        select(
            func.coalesce(func.sum(models.OrderItem.quantity), 0).label("units_sold"),
            func.coalesce(func.sum(models.OrderItem.subtotal), Decimal("0.00")).label("revenue"),
            func.count(models.OrderItem.order_id).label("order_count"),
            func.max(models.Order.order_date).label("last_sold_at"),
        )
        .select_from(models.OrderItem)
        .join(
            models.Order,
            (models.OrderItem.order_id == models.Order.order_id)
            & (models.Order.payment_status.in_(COUNTED_STATUSES)),
        )
        .where(models.OrderItem.product_id == product_id)
    ).mappings().first()

    units_sold = int(agg["units_sold"] or 0)
    revenue = Decimal(agg["revenue"] or 0).quantize(Decimal("0.01"))
    order_count = int(agg["order_count"] or 0)

    # Recent sales rows (newest first), regardless of payment status so the
    # market page surfaces live activity (pending tabs in flight too).
    recent_rows = db.execute(
        select(
            models.OrderItem.order_id,
            models.Order.order_date,
            models.OrderItem.quantity,
            models.OrderItem.unit_price,
            models.OrderItem.subtotal,
            models.Order.payment_status,
            models.Customer.first_name,
            models.Customer.last_name,
        )
        .select_from(models.OrderItem)
        .join(models.Order, models.OrderItem.order_id == models.Order.order_id)
        .outerjoin(
            models.Customer,
            models.Order.customer_id == models.Customer.customer_id,
        )
        .where(models.OrderItem.product_id == product_id)
        .order_by(models.Order.order_date.desc())
        .limit(recent)
    ).mappings().all()

    recent_sales: List[schemas.ProductSaleRecord] = []
    for row in recent_rows:
        first = row["first_name"] or ""
        last = row["last_name"] or ""
        name = f"{first} {last}".strip() or None
        recent_sales.append(
            schemas.ProductSaleRecord(
                order_id=row["order_id"],
                order_date=row["order_date"],
                quantity=int(row["quantity"]),
                unit_price=Decimal(row["unit_price"]).quantize(Decimal("0.01")),
                subtotal=Decimal(row["subtotal"]).quantize(Decimal("0.01")),
                payment_status=row["payment_status"],
                customer_name=name,
            )
        )

    # 14-day timeseries of paid sales for the sparkline / bar chart.
    start_date = (datetime.now() - timedelta(days=TIMESERIES_DAYS - 1)).date()
    series_rows = db.execute(
        select(
            func.date(models.Order.order_date).label("day"),
            func.coalesce(func.sum(models.OrderItem.quantity), 0).label("units"),
            func.coalesce(func.sum(models.OrderItem.subtotal), Decimal("0.00")).label("revenue"),
        )
        .select_from(models.OrderItem)
        .join(
            models.Order,
            (models.OrderItem.order_id == models.Order.order_id)
            & (models.Order.payment_status.in_(COUNTED_STATUSES)),
        )
        .where(
            models.OrderItem.product_id == product_id,
            func.date(models.Order.order_date) >= start_date,
        )
        .group_by(func.date(models.Order.order_date))
        .order_by(func.date(models.Order.order_date))
    ).mappings().all()
    by_day: dict[str, dict] = {
        str(row["day"]): {"units": int(row["units"]), "revenue": Decimal(row["revenue"]).quantize(Decimal("0.01"))}
        for row in series_rows
    }

    timeseries: List[schemas.ProductTimeseriesPoint] = []
    cursor = start_date
    today = date.today()
    while cursor <= today:
        bucket = by_day.get(cursor.isoformat(), {"units": 0, "revenue": Decimal("0.00")})
        timeseries.append(
            schemas.ProductTimeseriesPoint(
                day=cursor,
                units=bucket["units"],
                revenue=bucket["revenue"],
            )
        )
        cursor += timedelta(days=1)

    return schemas.ProductMarketDetail(
        product_id=product.product_id,
        product_name=product.product_name,
        category_name=category_name,
        price=Decimal(product.price).quantize(Decimal("0.01")),
        stock_quantity=product.stock_quantity,
        image_url=product.image_url,
        units_sold=units_sold,
        revenue=revenue,
        order_count=order_count,
        last_sold_at=agg["last_sold_at"],
        recent_sales=recent_sales,
        timeseries=timeseries,
        refreshed_at=datetime.now(),
    )
