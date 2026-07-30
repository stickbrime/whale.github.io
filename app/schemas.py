"""Pydantic request and response models for the coffee shop API."""

from datetime import date, datetime, time
from decimal import Decimal
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class PaymentStatus(str, Enum):
    pending = "pending"
    paid = "paid"
    failed = "failed"
    refunded = "refunded"
    cancelled = "cancelled"


class CustomerBase(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    phone: str = Field(min_length=5, max_length=30)


class CustomerCreate(CustomerBase):
    loyalty_points: int = Field(default=0, ge=0)


class CustomerUpdate(BaseModel):
    first_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(default=None, min_length=5, max_length=30)
    loyalty_points: Optional[int] = Field(default=None, ge=0)


class CustomerRead(CustomerBase, ORMModel):
    customer_id: int
    loyalty_points: int
    join_date: date
    seiue_id: Optional[int] = None


class EmployeeBase(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    role: str = Field(min_length=1, max_length=100)
    phone: str = Field(min_length=5, max_length=30)
    hire_date: date


class EmployeeCreate(EmployeeBase):
    pass


class EmployeeUpdate(BaseModel):
    first_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    role: Optional[str] = Field(default=None, min_length=1, max_length=100)
    phone: Optional[str] = Field(default=None, min_length=5, max_length=30)
    hire_date: Optional[date] = None


class EmployeeRead(EmployeeBase, ORMModel):
    employee_id: int


class CategoryBase(BaseModel):
    category_name: str = Field(min_length=1, max_length=100)


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    category_name: str = Field(min_length=1, max_length=100)


class CategoryRead(CategoryBase, ORMModel):
    category_id: int


class ProductBase(BaseModel):
    product_name: str = Field(min_length=1, max_length=150)
    description: Optional[str] = None
    price: Decimal = Field(ge=0, max_digits=10, decimal_places=2)
    stock_quantity: int = Field(default=0, ge=0)
    category_id: int = Field(gt=0)

    @field_validator("price")
    @classmethod
    def normalize_price(cls, value: Decimal) -> Decimal:
        return value.quantize(Decimal("0.01"))


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    product_name: Optional[str] = Field(default=None, min_length=1, max_length=150)
    description: Optional[str] = None
    price: Optional[Decimal] = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    stock_quantity: Optional[int] = Field(default=None, ge=0)
    category_id: Optional[int] = Field(default=None, gt=0)


class ProductRead(ProductBase, ORMModel):
    product_id: int


class ProductSummary(ORMModel):
    product_id: int
    product_name: str


class OrderItemCreate(BaseModel):
    product_id: int = Field(gt=0)
    quantity: int = Field(gt=0, le=100)
    customization: Optional[str] = Field(default=None, max_length=1000)


class OrderCreate(BaseModel):
    customer_id: int = Field(gt=0)
    employee_id: Optional[int] = Field(default=None, gt=0)
    pickup_time: Optional[time] = None
    payment_status: PaymentStatus = PaymentStatus.paid
    credit_days: Optional[int] = Field(default=None, ge=1, le=14)
    items: List[OrderItemCreate] = Field(min_length=1, max_length=50)

    @field_validator("payment_status")
    @classmethod
    def validate_new_order_status(cls, value: PaymentStatus) -> PaymentStatus:
        if value not in (PaymentStatus.pending, PaymentStatus.paid):
            raise ValueError("A new order must start as pending or paid")
        return value

    @field_validator("credit_days")
    @classmethod
    def validate_credit_days(cls, value: Optional[int]) -> Optional[int]:
        return value


class OrderItemRead(ORMModel):
    order_item_id: int
    quantity: int
    unit_price: Decimal
    subtotal: Decimal
    customization: Optional[str]
    product_id: int
    product: ProductSummary


class OrderRead(ORMModel):
    order_id: int
    order_date: datetime
    total_amount: Decimal
    payment_status: PaymentStatus
    pickup_time: Optional[time]
    customer_id: int
    employee_id: Optional[int]
    credit_days: Optional[int]
    credit_due_at: Optional[datetime]
    paid_at: Optional[datetime]
    items: List[OrderItemRead]


class OrderUpdate(BaseModel):
    employee_id: Optional[int] = Field(default=None, gt=0)
    pickup_time: Optional[time] = None
    payment_status: Optional[PaymentStatus] = None


class StockAdjustment(BaseModel):
    quantity_change: int

    @field_validator("quantity_change")
    @classmethod
    def quantity_change_must_not_be_zero(cls, value: int) -> int:
        if value == 0:
            raise ValueError("quantity_change must not be zero")
        return value


class StockResponse(BaseModel):
    product_id: int
    stock_quantity: int


class Message(BaseModel):
    message: str


class HealthResponse(BaseModel):
    status: str
    service: str


class CreditStatus(BaseModel):
    customer_id: int
    locked: bool
    overdue_orders: List[int]
    outstanding_amount: Decimal
    earliest_due_at: Optional[datetime]


class AuthStatus(BaseModel):
    authenticated: bool
    configured: bool
    customer: Optional[CustomerRead] = None
    credit: Optional[CreditStatus] = None
