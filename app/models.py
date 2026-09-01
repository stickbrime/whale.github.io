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

    orders: Mapped[List["Order"]] = relationship(back_populates="customer", passive_deletes=True)

    __table_args__ = (CheckConstraint("loyalty_points >= 0", name="ck_customer_loyalty_nonnegative"),)


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
            "payment_method IN ('cash', 'wechat', 'alipay', 'card')",
            name="ck_order_payment_method",
        ),
        CheckConstraint(
            "payment_status IN ('pending', 'paid', 'failed', 'refunded', 'cancelled')",
            name="ck_order_payment_status",
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
