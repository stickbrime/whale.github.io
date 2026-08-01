import type { AuthStatus, Category, CreditStatus, Customer, Order, Product } from './types'

const API = '/api/v1'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...options,
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
  authStatus: () => request<AuthStatus>('/auth/me'),
  logout: () => request<{ message: string }>('/auth/logout', { method: 'POST' }),
  payOrder: (id: number) => request<Order>(`/orders/${id}/pay`, { method: 'POST' }),
  createCustomer: (data: Pick<Customer, 'first_name' | 'last_name' | 'email' | 'phone'>) =>
    request<Customer>('/customers', { method: 'POST', body: JSON.stringify(data) }),
  updateCustomer: (id: number, data: Partial<Customer>) =>
    request<Customer>(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  createOrder: (data: {
    customer_id: number
    pickup_time?: string
    payment_status: 'pending' | 'paid'
    credit_days?: number
    items: Array<{ product_id: number; quantity: number; customization?: string }>
  }) => request<Order>('/orders', { method: 'POST', body: JSON.stringify(data) })
}
