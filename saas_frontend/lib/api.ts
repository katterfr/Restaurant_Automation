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
  stripe_connect_account_id: string | null
  stripe_connect_status: 'not_connected' | 'pending' | 'active'
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

export interface SmsSession {
  id: number
  tenant_id: number
  customer_phone: string
  status: string
  order_id: number | null
  started_at: string
  last_message_at: string
  message_count: number
}

export interface SmsMessage {
  id: number
  session_id: number
  role: string
  content: string
  created_at: string
}

export interface PhoneStatus {
  configured: boolean
  agent: PhoneAgent | null
  recent_calls: PhoneCall[]
}

export interface CreativeAsset {
  id: number
  tenant_id: number
  type: 'image' | 'video'
  status: 'pending' | 'processing' | 'completed' | 'failed'
  prompt: string
  style: string
  aspect_ratio: string
  url: string | null
  thumbnail_url: string | null
  error_message: string | null
  created_at: string
}

export interface TenantCustomization {
  accent_color: string
  logo_url: string
  banner_url: string
  welcome_msg: string
  dark_mode: boolean
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
  auth: {
    changePassword: (currentPassword: string, newPassword: string) =>
      request<{ message: string }>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      }),
  },
  tenants: {
    list: () => request<Tenant[]>('/tenants/'),
    get: (id: number) => request<Tenant>(`/tenants/${id}`),
    getPublic: (slug: string) => request<{ id: number; name: string; slug: string; status: string }>(`/tenants/public/${slug}`),
    analytics: () => request<{
      growth: Array<{ month: string; count: number }>
      plan_distribution: Array<{ plan: string; count: number; mrr: number }>
    }>('/tenants/analytics'),
    stats: () => request<TenantStats>('/tenants/stats'),
    create: (data: { name: string; slug: string; plan: string }) =>
      request<Tenant>('/tenants/', { method: 'POST', body: JSON.stringify(data) }),
    patch: (id: number, data: { name?: string; slug?: string; status?: string; plan?: string }) =>
      request<Tenant>(`/tenants/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: number) => request<void>(`/tenants/${id}`, { method: 'DELETE' }),
    syncFeatures: (id: number) =>
      request<{ ok: boolean; plan: string }>(`/tenants/${id}/sync-features`, { method: 'POST' }),
  },
  billing: {
    plans: () => request<Record<string, Plan>>('/billing/plans'),
    subscription: (id: number) => request<Subscription>(`/billing/subscription/${id}`),
    upgrade: (id: number, plan: string) =>
      request(`/billing/subscription/${id}/upgrade`, {
        method: 'POST',
        body: JSON.stringify({ plan }),
      }),
    checkoutByPlan: (data: { tenant_id: number; plan: string; billing_cycle: string; success_url: string; cancel_url: string }) =>
      request<{ checkout_url: string }>('/billing/checkout-by-plan', { method: 'POST', body: JSON.stringify(data) }),
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
    saveCredentials: (platform: string, data: { access_token: string; account_id: string; page_id?: string }) =>
      request<{ ok: boolean; platform: string }>(`/ads/credentials/${platform}`, { method: 'POST', body: JSON.stringify(data) }),
    disconnect: (platform: string) =>
      request<{ ok: boolean }>(`/ads/connect/${platform}`, { method: 'DELETE' }),
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
    analytics: () => request<{
      daily: Array<{ date: string; label: string; short: string; orders: number; revenue: number }>
      sources: Array<{ source: string; count: number }>
      this_week: { orders: number; revenue: number }
      last_week: { orders: number; revenue: number }
    }>('/portal/analytics'),
    customization: () => request<TenantCustomization>('/portal/customization'),
    saveCustomization: (data: Partial<TenantCustomization>) =>
      request<TenantCustomization>('/portal/customization', { method: 'PUT', body: JSON.stringify(data) }),
    chat: (messages: Array<{ role: string; content: string; image?: string }>) =>
      request<{ reply: string; navigate: string | null; action_result: Record<string, unknown> | null }>('/portal/chat', { method: 'POST', body: JSON.stringify({ messages }) }),
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
  creative: {
    library: () => request<{ configured: boolean; assets: CreativeAsset[] }>('/creative/library'),
    generateImage: (data: { prompt: string; style: string; aspect_ratio: string }) =>
      request<{ id: number; status: string; url: string }>('/creative/image', { method: 'POST', body: JSON.stringify(data) }),
    generateVideo: (data: { prompt: string; image_url?: string; duration?: number; aspect_ratio?: string; style?: string }) =>
      request<{ id: number; status: string; request_id: string }>('/creative/video', { method: 'POST', body: JSON.stringify(data) }),
    videoStatus: (id: number) => request<{ id: number; status: string; url?: string; error?: string }>(`/creative/video/${id}/status`),
    delete: (id: number) => request<void>(`/creative/${id}`, { method: 'DELETE' }),
  },
  phone: {
    status: () => request<PhoneStatus>('/phone/status'),
    activate: (data: { greeting?: string; special_instructions?: string; existing_number?: string }) =>
      request<PhoneAgent>('/phone/activate', { method: 'POST', body: JSON.stringify(data) }),
    setNumber: (data: { existing_number?: string; provision_new?: boolean; area_code?: string }) =>
      request<PhoneAgent>('/phone/number', { method: 'PATCH', body: JSON.stringify(data) }),
    syncMenu: () => request<{ ok: boolean; menu_items_synced: number }>('/phone/sync-menu', { method: 'POST' }),
    updateConfig: (data: { greeting?: string; special_instructions?: string }) =>
      request<PhoneAgent>('/phone/config', { method: 'PUT', body: JSON.stringify(data) }),
    deactivate: () => request<void>('/phone/deactivate', { method: 'DELETE' }),
    calls: () => request<PhoneCall[]>('/phone/calls'),
    smsSessions: () => request<SmsSession[]>('/phone/sms/sessions'),
    smsMessages: (sessionId: number) => request<{ session: SmsSession; messages: SmsMessage[] }>(`/phone/sms/sessions/${sessionId}/messages`),
    connectStripeStart: () => request<{ url: string }>('/phone/connect-stripe/start', { method: 'POST' }),
    connectStripeRefresh: () => request<{ status: string }>('/phone/connect-stripe/refresh', { method: 'POST' }),
  },
  public: {
    stats: () =>
      request<{ restaurant_count: number; order_count: number }>('/public/stats'),
    chat: (messages: Array<{ role: string; content: string }>) =>
      request<{ reply: string; navigate: string | null }>('/public/chat', { method: 'POST', body: JSON.stringify({ messages }) }),
    contact: (data: { name: string; email: string; restaurant_name?: string; phone?: string; plan_interest?: string; message: string }) =>
      request<{ ok: boolean }>('/public/contact', { method: 'POST', body: JSON.stringify(data) }),
    signup: (data: { restaurant_name: string; owner_email: string; owner_password: string; phone?: string; city?: string; plan?: string }) =>
      request<{ ok: boolean; tenant_id: number; slug: string; portal_url: string }>('/public/signup', { method: 'POST', body: JSON.stringify(data) }),
  },
  adminChat: {
    chat: (messages: Array<{ role: string; content: string; image?: string }>) =>
      request<{ reply: string; navigate: string | null; action_result: Record<string, unknown> | null }>('/admin/chat', { method: 'POST', body: JSON.stringify({ messages }) }),
  },
  adminFeatures: {
    get: (tenantId: number) => request<Record<string, boolean>>(`/features/${tenantId}`),
    toggle: (tenantId: number, feature: string) =>
      request<{ feature: string; enabled: boolean }>(`/features/${tenantId}/${feature}`, { method: 'POST' }),
    list: () => request<Record<string, string>>('/features/list'),
  },
  team: {
    list: (tenantId: number) => request<TeamMember[]>(`/portal/tenants/${tenantId}/team`),
    listOwners: (tenantId: number) =>
      request<Array<{ id: number; email: string; display_name: string; role: string; created_at: string }>>(`/portal/tenants/${tenantId}/owner-accounts`),
    create: (tenantId: number, data: { display_name: string; email: string; password: string; role: string; permissions: string[] }) =>
      request<TeamMember>(`/portal/tenants/${tenantId}/team`, { method: 'POST', body: JSON.stringify(data) }),
    update: (tenantId: number, userId: number, data: { display_name?: string; role?: string; permissions?: string[] }) =>
      request<TeamMember>(`/portal/tenants/${tenantId}/team/${userId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    remove: (tenantId: number, userId: number) =>
      request<void>(`/portal/tenants/${tenantId}/team/${userId}`, { method: 'DELETE' }),
    resetPassword: (tenantId: number, userId: number, newPassword: string) =>
      request<{ ok: boolean }>(`/portal/tenants/${tenantId}/users/${userId}/password`, {
        method: 'PATCH', body: JSON.stringify({ new_password: newPassword }),
      }),
  },
}

export interface TeamMember {
  id: number
  display_name: string
  email: string
  role: string
  permissions: string[]
  created_at: string
}
