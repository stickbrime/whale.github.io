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


class PaymentMethod(str, Enum):
    cash = "cash"
    wechat = "wechat"
    alipay = "alipay"
    card = "card"


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
    image_url: Optional[str] = None
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
    image_url: Optional[str] = None
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
    payment_method: PaymentMethod = PaymentMethod.wechat
    payment_status: PaymentStatus = PaymentStatus.pending
    items: List[OrderItemCreate] = Field(min_length=1, max_length=50)

    @field_validator("payment_status")
    @classmethod
    def validate_new_order_status(cls, value: PaymentStatus) -> PaymentStatus:
        if value not in (PaymentStatus.pending, PaymentStatus.paid):
            raise ValueError("A new order must start as pending or paid")
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
    payment_method: PaymentMethod
    payment_status: PaymentStatus
    pickup_code: Optional[str] = None
    pickup_time: Optional[time]
    customer_id: int
    customer_name: Optional[str] = None
    employee_id: Optional[int]
    items: List[OrderItemRead]
    print_status: Optional[str] = None
    receipt_preview: Optional[str] = None


class OrderUpdate(BaseModel):
    employee_id: Optional[int] = Field(default=None, gt=0)
    pickup_time: Optional[time] = None
    payment_status: Optional[PaymentStatus] = None


class PaymentRequest(BaseModel):
    """模拟支付请求；网关真实接入时替换为带签名的回调 payload。"""
    third_party_ref: Optional[str] = Field(default=None, max_length=100)


class PaymentResponse(BaseModel):
    order_id: int
    payment_status: PaymentStatus
    message: str


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


class ManualLoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=320)
    first_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(default=None, min_length=1, max_length=100)


class CreditStatus(ORMModel):
    customer_id: int
    locked: bool
    overdue_orders: List[int]
    outstanding_amount: Decimal
    earliest_due_at: Optional[date]


class AuthStatus(ORMModel):
    authenticated: bool
    configured: bool = True
    customer: Optional["CustomerRead"] = None
    credit: Optional[CreditStatus] = None


class CouponBase(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    title: str = Field(min_length=1, max_length=150)
    description: Optional[str] = Field(default=None, max_length=1000)
    discount_percent: Decimal = Field(ge=0, le=100, max_digits=5, decimal_places=2)
    is_active: bool = True
    valid_from: Optional[date] = None
    valid_until: Optional[date] = None
    max_claims: Optional[int] = Field(default=None, ge=0)
    sort_order: int = Field(default=0, ge=0)

    @field_validator("discount_percent")
    @classmethod
    def normalize_discount(cls, value: Decimal) -> Decimal:
        return value.quantize(Decimal("0.01"))


class CouponCreate(CouponBase):
    pass


class CouponUpdate(BaseModel):
    code: Optional[str] = Field(default=None, min_length=1, max_length=50)
    title: Optional[str] = Field(default=None, min_length=1, max_length=150)
    description: Optional[str] = Field(default=None, max_length=1000)
    discount_percent: Optional[Decimal] = Field(
        default=None, ge=0, le=100, max_digits=5, decimal_places=2
    )
    is_active: Optional[bool] = None
    valid_from: Optional[date] = None
    valid_until: Optional[date] = None
    max_claims: Optional[int] = Field(default=None, ge=0)
    sort_order: Optional[int] = Field(default=None, ge=0)

    @field_validator("discount_percent")
    @classmethod
    def normalize_discount(cls, value: Optional[Decimal]) -> Optional[Decimal]:
        return value.quantize(Decimal("0.01")) if value is not None else None


class CouponRead(CouponBase, ORMModel):
    coupon_id: int
    claimed_count: int
    created_at: datetime
    remaining_claims: Optional[int] = None


class CouponClaimResponse(BaseModel):
    coupon_id: int
    code: str
    title: str
    description: Optional[str] = None
    discount_percent: Decimal
    message: str
