export type Product = {
  product_id: number
  product_name: string
  description: string | null
  price: string
  stock_quantity: number
  image_url: string | null
  category_id: number
}

export type Category = {
  category_id: number
  category_name: string
}

export type Customer = {
  customer_id: number
  first_name: string
  last_name: string
  email: string
  phone: string
  loyalty_points: number
  join_date: string
  balance: string
  role: 'customer' | 'student' | 'staff' | 'admin'
  blocked: number
  auth_provider: string
  permissions: string[]
  seiue_id?: number | null
}

export type OrderItem = {
  order_item_id: number
  quantity: number
  unit_price: string
  subtotal: string
  customization: string | null
  product_id: number
  product: { product_id: number; product_name: string }
}

export type Order = {
  order_id: number
  order_date: string
  total_amount: string
  payment_method: 'cash' | 'wechat' | 'alipay' | 'card' | 'balance' | 'pay_later'
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled'
  fulfillment_status: 'waiting' | 'done'
  pickup_code: string | null
  pickup_time: string | null
  customer_id: number
  customer_name: string | null
  employee_id: number | null
  credit_days: number | null
  credit_due_at: string | null
  paid_at: string | null
  items: OrderItem[]
  print_status: 'printed' | 'no_printer' | 'disabled' | null
  receipt_preview: string | null
}

export type CartItem = Product & {
  quantity: number
  customization?: string
}

export type Language = 'en' | 'zh'

export type CreditStatus = {
  customer_id: number
  locked: boolean
  overdue_orders: number[]
  outstanding_amount: string
  earliest_due_at: string | null
}

export type AuthStatus = {
  authenticated: boolean
  configured: boolean
  customer: Customer | null
  credit: CreditStatus | null
}

export type AuthProviders = {
  providers: {
    email: boolean
    phone: boolean
    seiue: boolean
    feishu: boolean
    wechat: boolean
  }
  message: string | null
}

export type BalanceTransaction = {
  balance_transaction_id: number
  customer_id: number
  amount: string
  kind: 'topup' | 'payment' | 'refund' | 'adjustment'
  status: string
  note: string | null
  order_id: number | null
  created_at: string
}

export type WalletSummary = {
  customer_id: number
  balance: string
  max_balance: string
  recharge_minimum: string
  transactions: BalanceTransaction[]
}

export type StoreSettings = {
  store_open: boolean
  weekdays_only: boolean
  open_time: string
  close_time: string
  pre_order_start_time: string
  maximum_cups_per_order: number
  maximum_cups_per_day: number
  maximum_pre_order_cups_per_day: number
  maximum_balance: string
  balance_recharge_minimum: string
  allow_pay_later: boolean
  allow_delivery: boolean
  announcement: string
}

export type StoreStatus = {
  open: boolean
  reason: string | null
  settings: StoreSettings
}

export type StaffProfile = {
  customer_id: number
  name: string
  email: string
  role: string
  permissions: string[]
  is_admin: boolean
}

export type StaffCustomer = Customer & { order_count: number }

export type AuditLog = {
  audit_log_id: number
  actor_customer_id: number | null
  action: string
  target: string | null
  detail: string | null
  created_at: string
}

export type Coupon = {
  coupon_id: number
  code: string
  title: string
  description: string | null
  discount_percent: number
  is_active: boolean
  valid_from: string | null
  valid_until: string | null
  max_claims: number | null
  claimed_count: number
  sort_order: number
  created_at: string
  remaining_claims: number | null
}

// A coupon the visitor has claimed and is currently applying on the shop tab.
export type ClaimedCoupon = {
  coupon_id: number
  code: string
  title: string
  description: string | null
  discount_percent: number
  claimed_at: string
}

// --- Market analytics -----------------------------------------------------

export type MarketProductStat = {
  product_id: number
  product_name: string
  category_name: string | null
  price: string
  stock_quantity: number
  image_url: string | null
  units_sold: number
  revenue: string
  order_count: number
  last_sold_at: string | null
}

export type OverviewTimeseriesPoint = {
  day: string
  units: number
  revenue: string
  orders: number
}

export type MarketOverview = {
  total_revenue: string
  total_units: number
  total_orders: number
  paid_orders: number
  product_count: number
  products: MarketProductStat[]
  timeseries: OverviewTimeseriesPoint[]
}

export type ProductSaleRecord = {
  order_id: number
  order_date: string
  quantity: number
  unit_price: string
  subtotal: string
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled'
  customer_name: string | null
}

export type ProductTimeseriesPoint = {
  day: string
  units: number
  revenue: string
}

export type ProductMarketDetail = {
  product_id: number
  product_name: string
  category_name: string | null
  price: string
  stock_quantity: number
  image_url: string | null
  units_sold: number
  revenue: string
  order_count: number
  last_sold_at: string | null
  recent_sales: ProductSaleRecord[]
  timeseries: ProductTimeseriesPoint[]
  refreshed_at: string
}