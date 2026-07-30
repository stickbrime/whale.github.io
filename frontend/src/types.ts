export type Product = {
  product_id: number
  product_name: string
  description: string | null
  price: string
  stock_quantity: number
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
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled'
  pickup_time: string | null
  customer_id: number
  employee_id: number | null
  credit_days: number | null
  credit_due_at: string | null
  paid_at: string | null
  items: OrderItem[]
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