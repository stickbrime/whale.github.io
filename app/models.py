"""Database entities based on the supplied coffee shop ER diagram."""

from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Customer(Base):
    __tablename__ = "customers"

    customer_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    phone: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    loyalty_points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    join_date: Mapped[date] = mapped_column(Date, default=date.today, nullable=False)

    # Account / staff features ported from the original Whale platform.
    balance: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), default=Decimal("0.00"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(20), default="customer", nullable=False)
    permissions: Mapped[str] = mapped_column(Text, default="", nullable=False)
    blocked: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    auth_provider: Mapped[str] = mapped_column(
        String(20), default="email", nullable=False
    )
    seiue_id: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, unique=True, index=True
    )
    feishu_open_id: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True, unique=True, index=True
    )
    wechat_open_id: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True, unique=True, index=True
    )

    orders: Mapped[List["Order"]] = relationship(back_populates="customer", passive_deletes=True)
    balance_transactions: Mapped[List["BalanceTransaction"]] = relationship(
        back_populates="customer", passive_deletes=True
    )

    @property
    def permission_list(self) -> List[str]:
        return [p for p in (self.permissions or "").split(",") if p]

    __table_args__ = (
        CheckConstraint("loyalty_points >= 0", name="ck_customer_loyalty_nonnegative"),
        CheckConstraint("balance >= 0", name="ck_customer_balance_nonnegative"),
    )


class Employee(Base):
    __tablename__ = "employees"

    employee_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    role: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    hire_date: Mapped[date] = mapped_column(Date, nullable=False)

    orders: Mapped[List["Order"]] = relationship(back_populates="employee")


class Category(Base):
    __tablename__ = "categories"

    category_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    category_name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)

    products: Mapped[List["Product"]] = relationship(
        back_populates="category", passive_deletes=True
    )


class Product(Base):
    __tablename__ = "products"

    product_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    product_name: Mapped[str] = mapped_column(String(150), unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    stock_quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    image_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.category_id", ondelete="RESTRICT"), nullable=False, index=True
    )

    category: Mapped["Category"] = relationship(back_populates="products")
    order_items: Mapped[List["OrderItem"]] = relationship(
        back_populates="product", passive_deletes=True
    )

    __table_args__ = (
        CheckConstraint("price >= 0", name="ck_product_price_nonnegative"),
        CheckConstraint("stock_quantity >= 0", name="ck_product_stock_nonnegative"),
    )


class Order(Base):
    __tablename__ = "orders"

    order_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    order_date: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.now, nullable=False
    )
    total_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    payment_method: Mapped[str] = mapped_column(String(20), default="wechat", nullable=False)
    payment_status: Mapped[str] = mapped_column(String(30), default="pending", nullable=False)
    fulfillment_status: Mapped[str] = mapped_column(
        String(20), default="waiting", nullable=False
    )
    pickup_code: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    pickup_time: Mapped[Optional[time]] = mapped_column(Time, nullable=True)
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.customer_id", ondelete="RESTRICT"), nullable=False, index=True
    )
    employee_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("employees.employee_id", ondelete="SET NULL"), nullable=True, index=True
    )

    customer: Mapped["Customer"] = relationship(back_populates="orders")
    employee: Mapped[Optional["Employee"]] = relationship(back_populates="orders")
    items: Mapped[List["OrderItem"]] = relationship(
        back_populates="order",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="selectin",
    )

    @property
    def customer_name(self) -> Optional[str]:
        if self.customer is None:
            return None
        return f"{self.customer.first_name} {self.customer.last_name}"

    __table_args__ = (
        CheckConstraint("total_amount >= 0", name="ck_order_total_nonnegative"),
        CheckConstraint(
            "payment_method IN ('cash', 'wechat', 'alipay', 'card', 'balance', 'pay_later')",
            name="ck_order_payment_method",
        ),
        CheckConstraint(
            "payment_status IN ('pending', 'paid', 'failed', 'refunded', 'cancelled')",
            name="ck_order_payment_status",
        ),
        CheckConstraint(
            "fulfillment_status IN ('waiting', 'done')",
            name="ck_order_fulfillment_status",
        ),
    )


class OrderItem(Base):
    __tablename__ = "order_items"

    order_item_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    customization: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.order_id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.product_id", ondelete="RESTRICT"), nullable=False, index=True
    )

    order: Mapped["Order"] = relationship(back_populates="items")
    product: Mapped["Product"] = relationship(back_populates="order_items", lazy="joined")

    __table_args__ = (
        UniqueConstraint("order_item_id", "order_id", name="uq_order_item_order"),
        CheckConstraint("quantity > 0", name="ck_order_item_quantity_positive"),
        CheckConstraint("unit_price >= 0", name="ck_order_item_price_nonnegative"),
        CheckConstraint("subtotal >= 0", name="ck_order_item_subtotal_nonnegative"),
    )


class Coupon(Base):
    """A claimable discount coupon shown to customers on the storefront."""

    __tablename__ = "coupons"

    coupon_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    discount_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("0.00")
    )
    is_active: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    valid_from: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    valid_until: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    max_claims: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    claimed_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)

    __table_args__ = (
        CheckConstraint(
            "discount_percent >= 0 AND discount_percent <= 100",
            name="ck_coupon_discount_range",
        ),
        CheckConstraint("is_active IN (0, 1)", name="ck_coupon_active_bool"),
        CheckConstraint("claimed_count >= 0", name="ck_coupon_claimed_nonnegative"),
        CheckConstraint(
            "max_claims IS NULL OR max_claims >= 0", name="ck_coupon_max_claims_nonnegative"
        ),
    )


class BalanceTransaction(Base):
    """Ledger for every movement of a customer's in-store balance."""

    __tablename__ = "balance_transactions"

    balance_transaction_id: Mapped[int] = mapped_column(
        Integer, primary_key=True, index=True
    )
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.customer_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # A positive topup credits the wallet; a payment is stored as a negative
    # amount so ``sum(amount)`` always equals the current balance.
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), default="topup", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="completed", nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    order_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("orders.order_id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.now, nullable=False
    )

    customer: Mapped["Customer"] = relationship(back_populates="balance_transactions")

    __table_args__ = (
        CheckConstraint(
            "kind IN ('topup', 'payment', 'refund', 'adjustment')",
            name="ck_balance_kind",
        ),
        CheckConstraint(
            "status IN ('pending', 'completed', 'failed', 'cancelled')",
            name="ck_balance_status",
        ),
    )


class StoreSetting(Base):
    """Key/value store for storefront configuration edited by volunteers."""

    __tablename__ = "store_settings"

    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.now, onupdate=datetime.now, nullable=False
    )


class AuditLog(Base):
    """General-purpose staff audit trail (orders, users, settings, balance)."""

    __tablename__ = "audit_logs"

    audit_log_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    actor_customer_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("customers.customer_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    action: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    target: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    detail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.now, nullable=False, index=True
    )
