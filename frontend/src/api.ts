import type {
  AuditLog,
  AuthProviders,
  AuthStatus,
  Category,
  Coupon,
  CreditStatus,
  Customer,
  MarketOverview,
  Order,
  Product,
  ProductMarketDetail,
  ProductVariant,
  StaffCustomer,
  StaffProfile,
  StoreSettings,
  StoreStatus,
  WalletSummary
} from './types'

const API = '/api/v1'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers }
  })
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const body = await response.json()
      message = typeof body.detail === 'string' ? body.detail : message
    } catch { /* response had no JSON body */ }
    throw new Error(message)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const api = {
  // Include zero-stock products so the storefront can render an explicit sold-out state.
  products: () => request<Product[]>('/products?limit=100'),
  categories: () => request<Category[]>('/categories'),
  customers: () => request<Customer[]>('/customers?limit=100'),
  customer: (id: number) => request<Customer>(`/customers/${id}`),
  customerOrders: (id: number) => request<Order[]>(`/customers/${id}/orders`),
  creditStatus: (id: number) => request<CreditStatus>(`/orders/customers/${id}/credit-status`),
  manualLogin: (data: { email: string; first_name?: string; last_name?: string }) =>
    request<{ message: string }>('/auth/login/manual', { method: 'POST', body: JSON.stringify(data) }),
  phoneLogin: (data: { phone: string; first_name?: string; last_name?: string }) =>
    request<{ message: string }>('/auth/login/phone', { method: 'POST', body: JSON.stringify(data) }),
  studentLogin: (data: { seiue_id: number; name: string; phone?: string }) =>
    request<{ message: string }>('/auth/login/student', { method: 'POST', body: JSON.stringify(data) }),
  authProviders: () => request<AuthProviders>('/auth/providers'),
  authStatus: () => request<AuthStatus>('/auth/me'),

  // Wallet
  wallet: () => request<WalletSummary>('/account/wallet'),
  topUp: (amount: string, note?: string) =>
    request<WalletSummary>('/account/wallet/topup', {
      method: 'POST',
      body: JSON.stringify({ amount, note })
    }),

  // Storefront status
  storeStatus: () => request<StoreStatus>('/store/status'),

  // Volunteer console
  staffMe: () => request<StaffProfile>('/staff/me'),
  staffOrders: (fulfillment?: 'waiting' | 'done') =>
    request<Order[]>(`/staff/orders${fulfillment ? `?fulfillment_status=${fulfillment}` : ''}`),
  staffFulfill: (id: number) =>
    request<Order>(`/staff/orders/${id}/fulfill`, { method: 'POST' }),
  staffReopen: (id: number) =>
    request<Order>(`/staff/orders/${id}/reopen`, { method: 'POST' }),
  staffSettings: () => request<StoreSettings>('/staff/settings'),
  staffSaveSettings: (data: Partial<StoreSettings>) =>
    request<StoreSettings>('/staff/settings', { method: 'PATCH', body: JSON.stringify(data) }),
  staffUsers: (search?: string) =>
    request<StaffCustomer[]>(`/staff/users${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  staffUpdateUser: (
    id: number,
    data: {
      role?: string
      permissions?: string[]
      blocked?: boolean
      loyalty_points?: number
      balance_delta?: string
      note?: string
    }
  ) => request<StaffCustomer>(`/staff/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  staffLogs: () => request<AuditLog[]>('/staff/logs'),
  staffCharge: (id: number, amount: string, note?: string) =>
    request<StaffCustomer>(`/staff/users/${id}/charge`, {
      method: 'POST',
      body: JSON.stringify({ amount, note })
    }),
  logout: () => request<{ message: string }>('/auth/logout', { method: 'POST' }),
  payOrder: (id: number) => request<Order>(`/orders/${id}/pay`, { method: 'POST' }),
  settleAll: (customerId: number) => request<Order[]>(`/orders/customers/${customerId}/settle-all`, { method: 'POST' }),
  createCustomer: (data: Pick<Customer, 'first_name' | 'last_name' | 'email' | 'phone'>) =>
    request<Customer>('/customers', { method: 'POST', body: JSON.stringify(data) }),
  updateCustomer: (id: number, data: Partial<Customer>) =>
    request<Customer>(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  createOrder: (data: {
    customer_id: number
    pickup_time?: string
    payment_method: 'cash' | 'wechat' | 'alipay' | 'balance' | 'pay_later'
    payment_status: 'pending' | 'paid'
    credit_days?: number
    items: Array<{ product_id: number; quantity: number; customization?: string; variant_id?: number; temperature_variant_id?: number }>
  }) => request<Order>('/orders', { method: 'POST', body: JSON.stringify(data) }),

  adminLogin: (email: string, password: string) =>
    request<{ message: string }>('/auth/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email, last_name: password }),
    }),
  adminStatus: () => request<{ authenticated: boolean }>('/auth/admin/status'),
  adminLogout: () =>
    request<{ message: string }>('/auth/admin/logout', { method: 'POST' }),

  // Admin-only data endpoints
  allOrders: (status?: string) => request<Order[]>(status ? `/orders?payment_status=${status}&limit=200` : '/orders?limit=200'),
  updateOrderStatus: (id: number, payment_status: string) =>
    request<Order>(`/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ payment_status }) }),
  createProduct: (data: Omit<Product, 'product_id' | 'variants'>) =>
    request<Product>('/products', { method: 'POST', body: JSON.stringify(data) }),
  updateProduct: (id: number, data: Partial<Omit<Product, 'variants'>>) =>
    request<Product>(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteProduct: (id: number) => request<void>(`/products/${id}`, { method: 'DELETE' }),
  createVariant: (productId: number, data: { name: string; group_name?: string; price_delta: string; stock_quantity: number | null; sort_order: number }) =>
    request<ProductVariant>(`/products/${productId}/variants`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  updateVariant: (
    productId: number,
    variantId: number,
    data: { name?: string; group_name?: string; price_delta?: string; stock_quantity?: number | null; sort_order?: number }
  ) =>
    request<ProductVariant>(`/products/${productId}/variants/${variantId}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    }),
  deleteVariant: (productId: number, variantId: number) =>
    request<void>(`/products/${productId}/variants/${variantId}`, { method: 'DELETE' }),
  adjustStock: (id: number, quantity_change: number) =>
    request<{ product_id: number; stock_quantity: number }>(`/products/${id}/stock`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity_change })
    }),

  // Coupons: list the active catalogue and claim one (increments server-side counter).
  coupons: () => request<Coupon[]>('/coupons'),
  couponsAll: () => request<Coupon[]>('/coupons?active_only=false'),
  createCoupon: (body: { code: string; title: string; description?: string | null; discount_percent: number; is_active?: boolean; valid_from?: string | null; valid_until?: string | null; max_claims?: number | null; sort_order?: number }) =>
    request<Coupon>('/coupons', { method: 'POST', body: JSON.stringify(body) }),
  updateCoupon: (id: number, body: Partial<{ code: string; title: string; description: string | null; discount_percent: number; is_active: boolean; valid_from: string | null; valid_until: string | null; max_claims: number | null; sort_order: number }>) =>
    request<Coupon>(`/coupons/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteCoupon: (id: number) => request<void>(`/coupons/${id}`, { method: 'DELETE' }),
  claimCoupon: (couponId: number) =>
    request<{
      coupon_id: number
      code: string
      title: string
      description: string | null
      discount_percent: number
      message: string
    }>(`/coupons/${couponId}/claim`, { method: 'POST' }),

  // Fetch a single order (used by the payment page to poll payment status).
  getOrder: (id: number) => request<Order>(`/orders/${id}`),

  // Market analytics — read-only storefront sales intel.
  marketOverview: (range = '7d') => request<MarketOverview>(`/stats/overview?range=${range}`),
  productMarketDetail: (id: number, recent = 20) =>
    request<ProductMarketDetail>(`/stats/products/${id}?recent=${recent}`),
}
