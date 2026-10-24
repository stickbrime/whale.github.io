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
    balance = "balance"
    pay_later = "pay_later"


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
    balance: Decimal = Decimal("0.00")
    role: str = "customer"
    blocked: int = 0
    auth_provider: str = "email"
    permissions: List[str] = Field(default_factory=list, validation_alias="permission_list")
    seiue_id: Optional[int] = None


class PhoneLoginRequest(BaseModel):
    phone: str = Field(min_length=6, max_length=30)
    first_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(default=None, min_length=1, max_length=100)


class StudentLoginRequest(BaseModel):
    """Simulated student SSO callback payload (LinkBAID/Seiue identity)."""

    seiue_id: int = Field(gt=0)
    name: str = Field(min_length=1, max_length=100)
    phone: Optional[str] = Field(default=None, min_length=6, max_length=30)
    pinyin: Optional[str] = Field(default=None, max_length=100)


class ProviderStatus(BaseModel):
    email: bool = True
    phone: bool = True
    seiue: bool = False
    feishu: bool = False
    wechat: bool = False


class AuthProviders(BaseModel):
    providers: ProviderStatus
    message: Optional[str] = None


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
    fulfillment_status: str = "waiting"
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
    fulfillment_status: Optional[str] = Field(default=None, pattern="^(waiting|done)$")


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


# ---------------------------------------------------------------------------
# Market analytics — sales aggregates computed from order_items × orders.
# Intentionally read-only and unauthenticated: this is storefront "market"
# intel (which products are selling), not financial reporting.
# ---------------------------------------------------------------------------


class MarketProductStat(ORMModel):
    """One row per product in the market overview table."""

    product_id: int
    product_name: str
    category_name: Optional[str] = None
    price: Decimal
    stock_quantity: int
    image_url: Optional[str] = None
    units_sold: int
    revenue: Decimal
    order_count: int
    last_sold_at: Optional[datetime] = None


class MarketOverview(ORMModel):
    """Aggregate KPIs plus the per-product breakdown for /market."""

    total_revenue: Decimal
    total_units: int
    total_orders: int
    paid_orders: int
    product_count: int
    products: List[MarketProductStat]
    timeseries: List["OverviewTimeseriesPoint"]


class OverviewTimeseriesPoint(ORMModel):
    """One bucket of aggregate sales for the overview chart. ``day`` is a
    display label — an ISO date, an hour like ``14:00``, or a month like
    ``2026-10`` — depending on the selected time range."""

    day: str
    units: int
    revenue: Decimal
    orders: int


class ProductSaleRecord(ORMModel):
    """A single recent sale of a product, used on the detail page."""

    order_id: int
    order_date: datetime
    quantity: int
    unit_price: Decimal
    subtotal: Decimal
    payment_status: str
    customer_name: Optional[str] = None


class ProductTimeseriesPoint(ORMModel):
    """One day of sales for the 14-day timeseries chart."""

    day: date
    units: int
    revenue: Decimal


class ProductMarketDetail(ORMModel):
    """Full per-product market sheet with KPIs, recent sales, and a chart."""

    product_id: int
    product_name: str
    category_name: Optional[str] = None
    price: Decimal
    stock_quantity: int
    image_url: Optional[str] = None
    units_sold: int
    revenue: Decimal
    order_count: int
    last_sold_at: Optional[datetime] = None
    recent_sales: List[ProductSaleRecord]
    timeseries: List[ProductTimeseriesPoint]
    refreshed_at: datetime


# ---------------------------------------------------------------------------
# Wallet / balance
# ---------------------------------------------------------------------------


class BalanceTransactionRead(ORMModel):
    balance_transaction_id: int
    customer_id: int
    amount: Decimal
    kind: str
    status: str
    note: Optional[str] = None
    order_id: Optional[int] = None
    created_at: datetime


class TopUpRequest(BaseModel):
    amount: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    note: Optional[str] = Field(default=None, max_length=200)

    @field_validator("amount")
    @classmethod
    def normalize_amount(cls, value: Decimal) -> Decimal:
        return value.quantize(Decimal("0.01"))


class WalletSummary(BaseModel):
    customer_id: int
    balance: Decimal
    max_balance: Decimal
    recharge_minimum: Decimal
    transactions: List[BalanceTransactionRead]


# ---------------------------------------------------------------------------
# Store settings edited by volunteers
# ---------------------------------------------------------------------------


class StoreSettingsRead(BaseModel):
    store_open: bool = True
    weekdays_only: bool = True
    open_time: str = "10:00"
    close_time: str = "15:00"
    pre_order_start_time: str = "10:00"
    maximum_cups_per_order: int = 2
    maximum_cups_per_day: int = 14
    maximum_pre_order_cups_per_day: int = 0
    maximum_balance: Decimal = Decimal("500.00")
    balance_recharge_minimum: Decimal = Decimal("20.00")
    allow_pay_later: bool = True
    allow_delivery: bool = True
    announcement: str = ""


class StoreSettingsUpdate(BaseModel):
    store_open: Optional[bool] = None
    weekdays_only: Optional[bool] = None
    open_time: Optional[str] = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    close_time: Optional[str] = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    pre_order_start_time: Optional[str] = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    maximum_cups_per_order: Optional[int] = Field(default=None, ge=1, le=100)
    maximum_cups_per_day: Optional[int] = Field(default=None, ge=0, le=1000)
    maximum_pre_order_cups_per_day: Optional[int] = Field(default=None, ge=0, le=1000)
    maximum_balance: Optional[Decimal] = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    balance_recharge_minimum: Optional[Decimal] = Field(
        default=None, ge=0, max_digits=10, decimal_places=2
    )
    allow_pay_later: Optional[bool] = None
    allow_delivery: Optional[bool] = None
    announcement: Optional[str] = Field(default=None, max_length=500)


class StoreStatus(BaseModel):
    open: bool
    reason: Optional[str] = None
    settings: StoreSettingsRead


# ---------------------------------------------------------------------------
# Staff (volunteer) dashboard
# ---------------------------------------------------------------------------


class StaffProfile(BaseModel):
    customer_id: int
    name: str
    email: str
    role: str
    permissions: List[str]
    is_admin: bool


class StaffCustomerRead(CustomerRead):
    order_count: int = 0


class StaffUserUpdate(BaseModel):
    role: Optional[str] = Field(default=None, pattern="^(customer|student|staff|admin)$")
    permissions: Optional[List[str]] = None
    blocked: Optional[bool] = None
    loyalty_points: Optional[int] = Field(default=None, ge=0)
    balance_delta: Optional[Decimal] = Field(default=None, max_digits=10, decimal_places=2)
    note: Optional[str] = Field(default=None, max_length=200)


class AuditLogRead(ORMModel):
    audit_log_id: int
    actor_customer_id: Optional[int] = None
    action: str
    target: Optional[str] = None
    detail: Optional[str] = None
    created_at: datetime
