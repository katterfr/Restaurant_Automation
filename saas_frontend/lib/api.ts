const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api-production-731b.up.railway.app'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('token')
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => ({ detail: res.statusText }))
  if (!res.ok) throw new Error(data.detail || res.statusText)
  return data as T
}

export async function login(email: string, password: string): Promise<{ access_token: string }> {
  const body = new URLSearchParams({ username: email, password })
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  const data = await res.json().catch(() => ({ detail: res.statusText }))
  if (!res.ok) throw new Error(data.detail || 'Invalid credentials')
  return data
}

export interface Tenant {
  id: number
  name: string
  slug: string
  plan: string
  status: string
  created_at: string
}

export interface Plan {
  name: string
  price_monthly: number
  features: string[]
}

export interface Subscription {
  tenant_id: number
  plan: string
  status: string
  plan_details: Plan
}

export const api = {
  tenants: {
    list: () => request<Tenant[]>('/tenants/'),
    get: (id: number) => request<Tenant>(`/tenants/${id}`),
    create: (data: { name: string; slug: string; plan: string }) =>
      request<Tenant>('/tenants/', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: number) => request<void>(`/tenants/${id}`, { method: 'DELETE' }),
  },
  billing: {
    plans: () => request<Record<string, Plan>>('/billing/plans'),
    subscription: (id: number) => request<Subscription>(`/billing/subscription/${id}`),
    upgrade: (id: number, plan: string) =>
      request(`/billing/subscription/${id}/upgrade`, {
        method: 'POST',
        body: JSON.stringify({ plan }),
      }),
  },
}
