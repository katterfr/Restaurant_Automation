const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api-production-731b.up.railway.app'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  // Portal tabs store their token in sessionStorage (tab-isolated).
  // Employee PWA pages write directly to localStorage — fall back to that
  // so api.* calls from /app pages continue to work unchanged.
  return sessionStorage.getItem('token') || localStorage.getItem('token')
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
    sessionStorage.removeItem('token')
    localStorage.removeItem('token')
    window.location.href = '/login'
    throw new Error('Session expired — please sign in again')
  }
  const data = await res.json().catch(() => ({ detail: res.statusText }))
  if (!res.ok) throw new Error(data.detail || res.statusText)
  return data as T
}

export async function login(email: string, password: string): Promise<{ access_token: string; password_breached?: boolean }> {
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

export const authApi = {
  async googleLogin(id_token: string) {
    const res = await fetch(`${API_URL}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_token }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'Google login failed')
    return data as { access_token: string; token_type: string } | { status: 'not_linked'; google_email: string; google_name: string; google_id: string }
  },
  async googleLink(id_token: string, email: string, password: string) {
    const res = await fetch(`${API_URL}/auth/google/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_token, email, password }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'Linking failed')
    return data as { access_token: string }
  },
  async sendPhoneOtp(phone: string) {
    const res = await fetch(`${API_URL}/auth/phone/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'Failed to send code')
    return data as { sent: boolean; phone: string; linked: boolean }
  },
  async verifyPhoneOtp(phone: string, otp: string) {
    const res = await fetch(`${API_URL}/auth/phone/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, otp }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'Invalid code')
    return data as { access_token: string; token_type: string } | { status: 'not_linked'; phone: string }
  },
  async phoneLink(phone: string, otp: string, email: string, password: string) {
    const res = await fetch(`${API_URL}/auth/phone/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, otp, email, password }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'Linking failed')
    return data as { access_token: string }
  },
  async forgotPassword(email_or_phone: string, slug = '') {
    const res = await fetch(`${API_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email_or_phone, slug }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'Request failed')
    return data as { sent: boolean; method: string }
  },
  async resetPassword(token: string, new_password: string) {
    const res = await fetch(`${API_URL}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, new_password }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'Reset failed')
    return data
  },
  async resetPasswordSms(phone: string, otp: string, new_password: string) {
    const res = await fetch(`${API_URL}/auth/reset-password/sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, otp, new_password }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'Reset failed')
    return data
  },
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
  page_id?: string | null
  ig_connected?: boolean
}

export interface MetaAccountInfo {
  page_id: string
  page_name: string
  page_picture: string
  ig_id: string
  ig_username: string
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
  verify_supported: boolean
  connected: boolean
  status: string
  store_id: string | null
  platform_ready: boolean
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

export interface StaffPolicy {
  enabled: boolean
  emergency_contacts: { name: string; phone: string; relation: string }[]
  kiosk_pin?: string
  chat_salt?: string
  geofence_enabled?: boolean
  geofence_lat?: number | null
  geofence_lng?: number | null
  geofence_radius_m?: number
}

export interface FocusExitLog {
  id: number
  user_id: number
  display_name: string
  user_email: string
  exited_at: string
}

export interface LiveData {
  today_orders: number
  today_revenue: number
  goals: BusinessGoal[]
  on_shift_count: number
  on_shift: { id: number; user_id: number; clocked_in_at: string; focus_exits: number; user_email: string; display_name: string }[]
  recent_orders: { id: number; order_source: string; total: number; status: string; created_at: string }[]
  focus_exit_logs: FocusExitLog[]
}
export interface EmployeeShift {
  id: number
  user_id: number
  tenant_id: number
  clocked_in_at: string
  clocked_out_at: string | null
  duration_minutes: number | null
  focus_exits: number
  notes: string | null
}

export interface EmployeeSchedule {
  id: number
  tenant_id: number
  user_id: number
  scheduled_date: string      // YYYY-MM-DD
  start_time: string          // HH:MM:SS
  end_time: string | null
  early_grace_minutes: number
  notes: string | null
  user_email?: string
  user_name?: string
}
export interface BusinessGoal {
  id: number
  title: string
  description: string | null
  metric: string
  target_value: number
  current_value: number
  period: string
  period_start: string
  period_end: string
  is_active: boolean
}
export interface StaffMessage {
  id: number
  from_user_id: number
  from_name: string
  content: string
  is_broadcast: boolean
  to_user_id: number | null
  created_at: string
  group_id?: number | null
  message_type?: string
}

export interface ChatGroup {
  id: number
  name: string
  description: string
  invite_code: string
  member_count: number
  created_at: string
  is_active: boolean
}

export interface StaffInsight {
  id: number
  category: string
  suggestion: string
  created_at: string
  reviewed: boolean
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
    connectUrl: (platform: string, source: 'ads' | 'social' = 'ads') => request<{ oauth_url: string }>(`/ads/connect/${platform}/url?source=${source}`),
    metaAccountInfo: () => request<MetaAccountInfo>('/ads/connect/meta/account-info'),
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
      request<{ reply: string; navigate: string | null; action_result: Record<string, unknown> | null; is_feedback?: boolean }>('/portal/chat', { method: 'POST', body: JSON.stringify({ messages }) }),
  },
  social: {
    posts: () => request<SocialPost[]>('/social/posts'),
    create: (data: { platforms: string[]; content: string; image_url?: string; video_url?: string; link_url?: string; media_type?: string }) =>
      request<{ id: number; status: string; results: Record<string, { status: string; error?: string }> }>('/social/posts', {
        method: 'POST', body: JSON.stringify(data),
      }),
    delete: (id: number) => request<void>(`/social/posts/${id}`, { method: 'DELETE' }),
    upload: async (file: File): Promise<{ url: string; is_video: boolean; content_type: string }> => {
      const token = typeof window !== 'undefined' ? (sessionStorage.getItem('token') || localStorage.getItem('token')) : null
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`${API_URL}/social/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || 'Upload failed') }
      return res.json()
    },
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
    verify: (provider: string, store_id: string) =>
      request<{ status: string; verified: boolean; message?: string }>(`/delivery/verify/${provider}`, { method: 'POST', body: JSON.stringify({ store_id }) }),
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
    library: () => request<{ configured: boolean; assets: CreativeAsset[]; plan: string; usage: { images: { used: number; limit: number }; videos: { used: number; limit: number } } }>('/creative/library'),
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
    testimonials: () => request<Testimonial[]>('/public/testimonials'),
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
  feedback: {
    submit: (data: { q1?: boolean; q2?: boolean; q3?: boolean; star_rating: number; comment?: string; owner_name?: string; user_role?: string }) =>
      request<{ id: number; status: string }>('/portal/feedback', { method: 'POST', body: JSON.stringify(data) }),
    mine: () => request<Testimonial[]>('/portal/feedback/mine'),
    logInteraction: (data: { action: string; page?: string; metadata?: Record<string, unknown> }) =>
      request<{ ok: boolean }>('/portal/interaction', { method: 'POST', body: JSON.stringify(data) }).catch(() => ({ ok: false })),
  },
  adminFeedback: {
    list: (status?: string) => request<Testimonial[]>(`/admin/feedback${status ? `?status=${status}` : ''}`),
    approve: (id: number) => request<{ id: number; status: string }>(`/admin/feedback/${id}/approve`, { method: 'PATCH' }),
    reject: (id: number) => request<{ id: number; status: string }>(`/admin/feedback/${id}/reject`, { method: 'PATCH' }),
    suggestions: (status?: string) => request<Suggestion[]>(`/admin/suggestions${status ? `?status=${status}` : ''}`),
    approveSuggestion: (id: number) => request<{ id: number; status: string }>(`/admin/suggestions/${id}/approve`, { method: 'PATCH' }),
    rejectSuggestion: (id: number) => request<{ id: number; status: string }>(`/admin/suggestions/${id}/reject`, { method: 'PATCH' }),
    insights: () => request<{ feedback: Record<string, number>; recent_comments: Testimonial[]; top_interactions: Array<{ action: string; page: string; count: number }> }>('/admin/insights'),
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
  staff: {
    getPolicy: () => request<StaffPolicy>('/staff/policy'),
    updatePolicy: (body: Partial<StaffPolicy>) => request<StaffPolicy>('/staff/policy', { method: 'PUT', body: JSON.stringify(body) }),
    clockIn: () => request<EmployeeShift>('/staff/clock-in', { method: 'POST', body: '{}' }),
    clockOut: () => request<EmployeeShift>('/staff/clock-out', { method: 'POST', body: '{}' }),
    focusExit: () => request<void>('/staff/focus-exit', { method: 'POST', body: '{}' }),
    currentShift: () => request<EmployeeShift | null>('/staff/shift/current'),
    shifts: () => request<EmployeeShift[]>('/staff/shifts'),
    getGoals: () => request<BusinessGoal[]>('/staff/goals'),
    createGoal: (body: Partial<BusinessGoal>) => request<BusinessGoal>('/staff/goals', { method: 'POST', body: JSON.stringify(body) }),
    updateGoal: (id: number, body: Partial<BusinessGoal>) => request<BusinessGoal>(`/staff/goals/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    deleteGoal: (id: number) => request<void>(`/staff/goals/${id}`, { method: 'DELETE' }),
    getMessages: (groupId?: number) =>
      request<StaffMessage[]>(`/staff/messages${groupId ? `?group_id=${groupId}` : ''}`),
    sendMessage: (content: string, groupId?: number, messageType?: string) =>
      request<StaffMessage>('/staff/messages', {
        method: 'POST',
        body: JSON.stringify({ content, group_id: groupId, message_type: messageType ?? 'text', is_broadcast: !groupId }),
      }),
    getGroups: () => request<ChatGroup[]>('/staff/groups'),
    createGroup: (name: string, description: string) =>
      request<{ id: number; name: string; invite_code: string }>('/staff/groups', {
        method: 'POST', body: JSON.stringify({ name, description }),
      }),
    joinGroup: (invite_code: string) =>
      request<{ ok: boolean; group_id: number; group_name: string }>('/staff/groups/join', {
        method: 'POST', body: JSON.stringify({ invite_code }),
      }),
    leaveGroup: (groupId: number) =>
      request<void>(`/staff/groups/${groupId}/leave`, { method: 'DELETE' }),
    getInsights: () => request<StaffInsight[]>('/staff/insights'),
    getLive: () => request<LiveData>('/staff/live'),
    requestExit: (exit_type: 'clock_out' | 'break') =>
      request<{ request_id: number; code: string; expires_in_minutes: number }>('/staff/exit-request', {
        method: 'POST',
        body: JSON.stringify({ exit_type }),
      }),
    confirmExit: (code: string) =>
      request<{ ok: boolean; exit_type: string }>('/staff/confirm-exit', {
        method: 'POST',
        body: JSON.stringify({ code }),
      }),
    getExitRequests: () =>
      request<{ id: number; exit_type: string; status: string; created_at: string; expires_at: string; user_email: string }[]>('/staff/exit-requests'),
    getEmployees: () => request<{ id: number; email: string; display_name: string; role: string }[]>('/staff/employees'),
    registerPushToken: (token: string, platform: 'fcm' | 'apns', appType: 'staff' | 'manager') =>
      request<void>('/staff/push-token', { method: 'POST', body: JSON.stringify({ token, platform, app_type: appType }) }),
    getMySchedule: () => request<EmployeeSchedule | null>('/staff/schedules/mine'),
    getSchedules: () => request<EmployeeSchedule[]>('/staff/schedules'),
    createSchedule: (body: Omit<EmployeeSchedule, 'id' | 'tenant_id' | 'user_email' | 'user_name'>) =>
      request<EmployeeSchedule>('/staff/schedules', { method: 'POST', body: JSON.stringify(body) }),
    updateSchedule: (id: number, body: Partial<Pick<EmployeeSchedule, 'start_time' | 'end_time' | 'early_grace_minutes' | 'notes'>>) =>
      request<EmployeeSchedule>(`/staff/schedules/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    deleteSchedule: (id: number) =>
      request<void>(`/staff/schedules/${id}`, { method: 'DELETE' }),
  },
  webauthn: {
    status: () => request<{ enrolled: boolean; credential_count: number }>('/auth/webauthn/status'),
  },
  tasks: {
    list: () => request<ScheduledTask[]>('/tasks'),
    create: (body: {
      label: string
      prompt: string
      schedule_type: 'cron' | 'once'
      cron_expression?: string
      run_at?: string
      timezone?: string
    }) => request<ScheduledTask>('/tasks', { method: 'POST', body: JSON.stringify(body) }),
    delete: (id: number) => request<void>(`/tasks/${id}`, { method: 'DELETE' }),
    toggle: (id: number) => request<{ id: number; is_active: boolean }>(`/tasks/${id}/toggle`, { method: 'PATCH' }),
    runNow: (id: number) => request<{ status: string; summary: string; action_type: string | null }>(`/tasks/${id}/run-now`, { method: 'POST' }),
    runs: (id: number) => request<ScheduledTaskRun[]>(`/tasks/${id}/runs`),
    // Admin-level platform tasks (tenant_id = 0)
    adminList: () => request<ScheduledTask[]>('/tasks/admin'),
    adminCreate: (body: {
      label: string
      prompt: string
      schedule_type: 'cron' | 'once'
      cron_expression?: string
      run_at?: string
      timezone?: string
    }) => request<ScheduledTask>('/tasks/admin', { method: 'POST', body: JSON.stringify(body) }),
    adminDelete: (id: number) => request<void>(`/tasks/admin/${id}`, { method: 'DELETE' }),
    adminToggle: (id: number) => request<{ id: number; is_active: boolean }>(`/tasks/admin/${id}/toggle`, { method: 'PATCH' }),
    adminRunNow: (id: number) => request<{ status: string; summary: string; action_type: string | null }>(`/tasks/admin/${id}/run-now`, { method: 'POST' }),
    adminRuns: (id: number) => request<ScheduledTaskRun[]>(`/tasks/admin/${id}/runs`),
  },
}

export interface ScheduledTask {
  id: number
  tenant_id: number
  label: string
  prompt: string
  schedule_type: 'cron' | 'once'
  cron_expression: string | null
  run_at: string | null
  timezone: string
  is_active: boolean
  last_run_at: string | null
  next_run_at: string | null
  created_at: string
  last_run?: ScheduledTaskRun | null
}

export interface ScheduledTaskRun {
  id: number
  task_id: number
  tenant_id: number
  started_at: string
  completed_at: string | null
  status: 'running' | 'success' | 'failed'
  result_summary: string | null
  action_type: string | null
}

export interface Testimonial {
  id: number
  tenant_id: number
  restaurant_name: string
  owner_name: string
  q1_overall: boolean | null
  q2_easy_to_use: boolean | null
  q3_effective: boolean | null
  star_rating: number
  comment: string | null
  status: string
  created_at: string
  approved_at: string | null
}

export interface Suggestion {
  id: number
  title: string
  description: string
  category: string
  priority: string
  source: string
  status: string
  admin_notes: string | null
  created_at: string
  reviewed_at: string | null
}

export interface TeamMember {
  id: number
  display_name: string
  email: string
  role: string
  permissions: string[]
  created_at: string
}
