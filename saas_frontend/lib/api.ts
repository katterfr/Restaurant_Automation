const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api-production-731b.up.railway.app'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('token')
}

export interface Order {
  id: number
  tenant_id: number
  order_source: string
  external_order_id: string | null
  status: string
  items: string | null
  total: number | null
  notes: string | null
  created_at: string
}

export interface PortalDashboard {
  tenant: { id: number; name: string; slug: string; plan: string; status: string }
  stats: {
    today_orders: number
    today_revenue: number
    total_orders: number
    total_revenue: number
    menu_items: number
    menu_active: number
  }
  recent_orders: Order[]
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
  if (res.status === 401) {
    localStorage.removeItem('token')
    window.location.href = '/login'
    throw new Error('Session expired — please sign in again')
  }
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

export interface TenantStats {
  total: number
  active: number
  mrr: number
  plans: Record<string, number>
}

export interface AdCampaign {
  id: number
  tenant_id: number
  platform: string
  status: string
  headline: string
  body: string
  image_url: string | null
  destination_url: string | null
  cta: string
  budget_daily: number
  location: string | null
  radius_miles: number
  start_date: string | null
  end_date: string | null
  impressions: number
  clicks: number
  spend: number
  error_message: string | null
  created_at: string
}

export interface PlatformStatus {
  configured: boolean
  connected: boolean
  ad_account_id: string | null
  connected_at: string | null
}

export interface SocialPost {
  id: number
  tenant_id: number
  platforms: string
  content: string
  image_url: string | null
  link_url: string | null
  status: string
  platform_results: string
  error_message: string | null
  created_at: string
}

export interface AccountingEntry {
  id: number
  tenant_id: number
  type: string
  category: string
  amount: number
  description: string | null
  date: string
  source: string
  created_at: string
}

export interface AccountingSummary {
  month_income: number
  month_expense: number
  month_profit: number
  total_income: number
  total_expense: number
  total_profit: number
  expense_by_category: Record<string, number>
}

export interface DeliveryProvider {
  name: string
  icon: string
  apply_url: string
  connected: boolean
  status: string
  store_id: string | null
}

export interface MenuItem {
  id: number
  tenant_id: number
  name: string
  category: string
  price: number
  description: string | null
  available: boolean
  created_at: string
}

export interface PhoneAgent {
  id: number
  tenant_id: number
  vapi_assistant_id: string | null
  vapi_phone_number_id: string | null
  phone_number: string | null
  greeting: string
  special_instructions: string
  is_active: boolean
  total_calls: number
  last_call_at: string | null
  created_at: string
}

export interface PhoneCall {
  id: number
  tenant_id: number
  vapi_call_id: string
  caller_number: string | null
  duration_secs: number
  summary: string | null
  transcript: string | null
  structured_data: string
  order_created: boolean
  order_id: number | null
  created_at: string
}

export interface PhoneStatus {
  configured: boolean
  agent: PhoneAgent | null
  recent_calls: PhoneCall[]
}

export interface TenantCustomization {
  accent_color: string
  logo_url: string
  banner_url: string
  welcome_msg: string
}

export interface BusinessListing {
  tenant_id: number
  name: string
  description: string
  phone: string
  website: string
  address_line1: string
  city: string
  state: string
  zip: string
  category: string
  logo_url: string
  hours: string
  google_status: string
  google_location_id: string | null
  apple_status: string
}

export interface BusinessStatus {
  google: { configured: boolean; connected: boolean; account_id: string | null; location_id: string | null; google_status: string; connected_at: string | null }
  apple:  { configured: boolean; submitted: boolean; apple_status: string; portal_url: string }
}

export const api = {
  tenants: {
    list: () => request<Tenant[]>('/tenants/'),
    get: (id: number) => request<Tenant>(`/tenants/${id}`),
    getPublic: (slug: string) => request<{ id: number; name: string; slug: string; status: string }>(`/tenants/public/${slug}`),
    stats: () => request<TenantStats>('/tenants/stats'),
    create: (data: { name: string; slug: string; plan: string }) =>
      request<Tenant>('/tenants/', { method: 'POST', body: JSON.stringify(data) }),
    patch: (id: number, data: { name?: string; slug?: string; status?: string }) =>
      request<Tenant>(`/tenants/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
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
  menu: {
    list: (tenantId: number) => request<MenuItem[]>(`/menu/${tenantId}`),
    add: (tenantId: number, data: { name: string; category: string; price: number; description?: string }) =>
      request<MenuItem>(`/menu/${tenantId}`, { method: 'POST', body: JSON.stringify(data) }),
    update: (tenantId: number, itemId: number, data: Partial<MenuItem>) =>
      request<MenuItem>(`/menu/${tenantId}/${itemId}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (tenantId: number, itemId: number) =>
      request<void>(`/menu/${tenantId}/${itemId}`, { method: 'DELETE' }),
  },
  ads: {
    status: () => request<Record<string, PlatformStatus>>('/ads/status'),
    campaigns: () => request<AdCampaign[]>('/ads/campaigns'),
    create: (data: {
      platforms: string[]
      headline: string
      body: string
      image_url?: string
      destination_url?: string
      cta?: string
      budget_daily?: number
      location?: string
      radius_miles?: number
      start_date?: string
      end_date?: string
    }) => request<Array<{ platform: string; status: string; id: number; error?: string }>>('/ads/campaigns', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    cancel: (id: number) => request<void>(`/ads/campaigns/${id}`, { method: 'DELETE' }),
    connectUrl: (platform: string) => request<{ oauth_url: string }>(`/ads/connect/${platform}/url`),
  },
  portal: {
    dashboard: () => request<PortalDashboard & { features: string[] }>('/portal/dashboard'),
    orders: (limit = 50) => request<Order[]>(`/portal/orders?limit=${limit}`),
    menu: () => request<MenuItem[]>('/portal/menu'),
    features: () => request<string[]>('/portal/features'),
    addMenuItem: (data: { name: string; category: string; price: number; description?: string; available?: boolean }) =>
      request<MenuItem>('/portal/menu', { method: 'POST', body: JSON.stringify(data) }),
    updateMenuItem: (id: number, data: Partial<MenuItem>) =>
      request<MenuItem>(`/portal/menu/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteMenuItem: (id: number) => request<void>(`/portal/menu/${id}`, { method: 'DELETE' }),
    createOwner: (tenantId: number, email: string, password: string) =>
      request(`/portal/tenants/${tenantId}/users`, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    customization: () => request<TenantCustomization>('/portal/customization'),
    saveCustomization: (data: Partial<TenantCustomization>) =>
      request<TenantCustomization>('/portal/customization', { method: 'PUT', body: JSON.stringify(data) }),
  },
  social: {
    posts: () => request<SocialPost[]>('/social/posts'),
    create: (data: { platforms: string[]; content: string; image_url?: string; link_url?: string }) =>
      request<{ id: number; status: string; results: Record<string, { status: string; error?: string }> }>('/social/posts', {
        method: 'POST', body: JSON.stringify(data),
      }),
    delete: (id: number) => request<void>(`/social/posts/${id}`, { method: 'DELETE' }),
  },
  accounting: {
    summary: () => request<AccountingSummary>('/accounting/summary'),
    entries: (type?: string) => request<AccountingEntry[]>(`/accounting/entries${type ? `?type=${type}` : ''}`),
    create: (data: { type: string; category: string; amount: number; description?: string; date?: string }) =>
      request<AccountingEntry>('/accounting/entries', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: number) => request<void>(`/accounting/entries/${id}`, { method: 'DELETE' }),
    categories: () => request<{ income: string[]; expense: string[] }>('/accounting/categories'),
  },
  delivery: {
    connections: () => request<Record<string, DeliveryProvider>>('/delivery/connections'),
    connect: (provider: string, data: { api_key: string; store_id?: string }) =>
      request(`/delivery/connect/${provider}`, { method: 'POST', body: JSON.stringify(data) }),
    disconnect: (provider: string) => request<void>(`/delivery/connect/${provider}`, { method: 'DELETE' }),
  },
  business: {
    status: () => request<BusinessStatus>('/business/status'),
    info: () => request<BusinessListing>('/business/info'),
    saveInfo: (data: Partial<BusinessListing>) => request<{ ok: boolean }>('/business/info', { method: 'PUT', body: JSON.stringify(data) }),
    googleConnectUrl: () => request<{ oauth_url: string }>('/business/google/connect-url'),
    googleLocations: () => request<{ locations: unknown[]; account_id: string }>('/business/google/locations'),
    googleSync: () => request<{ ok: boolean; location: unknown }>('/business/google/sync', { method: 'POST' }),
    googleDisconnect: () => request<{ ok: boolean }>('/business/google/disconnect', { method: 'DELETE' }),
    appleSubmit: () => request<{ status: string; message: string; portal_url: string }>('/business/apple/submit', { method: 'POST' }),
  },
  phone: {
    status: () => request<PhoneStatus>('/phone/status'),
    activate: (data: { greeting?: string; special_instructions?: string; area_code?: string }) =>
      request<PhoneAgent>('/phone/activate', { method: 'POST', body: JSON.stringify(data) }),
    syncMenu: () => request<{ ok: boolean; menu_items_synced: number }>('/phone/sync-menu', { method: 'POST' }),
    updateConfig: (data: { greeting?: string; special_instructions?: string }) =>
      request<PhoneAgent>('/phone/config', { method: 'PUT', body: JSON.stringify(data) }),
    deactivate: () => request<void>('/phone/deactivate', { method: 'DELETE' }),
    calls: () => request<PhoneCall[]>('/phone/calls'),
  },
  adminFeatures: {
    get: (tenantId: number) => request<Record<string, boolean>>(`/features/${tenantId}`),
    toggle: (tenantId: number, feature: string) =>
      request<{ feature: string; enabled: boolean }>(`/features/${tenantId}/${feature}`, { method: 'POST' }),
    list: () => request<Record<string, string>>('/features/list'),
  },
}
