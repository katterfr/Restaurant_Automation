'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api, PortalDashboard, Order, PlatformStatus } from '@/lib/api'
import { useCustomization } from '../tenant-context'
import TourOverlay, { TourStep } from '../tour'
import FeedbackModal from '../feedback-modal'
import Link from 'next/link'
import { BarChart, LineChart, DonutChart } from '@/app/components/charts'

// ── Platform metadata ──────────────────────────────────────────────────────────

const AD_PLATFORMS = [
  { key: 'meta',      label: 'Meta',      icon: 'f',  color: '#1877f2', desc: 'Facebook & Instagram Ads' },
  { key: 'google',    label: 'Google',    icon: 'G',  color: '#ea4335', desc: 'Search & Display Ads' },
  { key: 'youtube',   label: 'YouTube',   icon: '▶',  color: '#ff0000', desc: 'YouTube Video Ads' },
  { key: 'tiktok',    label: 'TikTok',    icon: '♪',  color: '#111',    desc: 'In-Feed Video Ads' },
  { key: 'snapchat',  label: 'Snapchat',  icon: 'S',  color: '#fffc00', fgDark: true, desc: 'Story & Snap Ads' },
  { key: 'pinterest', label: 'Pinterest', icon: 'P',  color: '#e60023', desc: 'Promoted Pins' },
] as const

const SOCIAL_PLATFORMS = [
  { key: 'meta',    label: 'Meta',    icon: 'f', color: '#1877f2', desc: 'Facebook & Instagram posts' },
  { key: 'youtube', label: 'YouTube', icon: '▶', color: '#ff0000', desc: 'Post videos to YouTube' },
  { key: 'tiktok',  label: 'TikTok',  icon: '♪', color: '#111',   desc: 'TikTok posts' },
] as const

const TOUR_STEPS: TourStep[] = [
  {
    targetId:  'dashboard-title',
    title:     'Your Command Center',
    body:      'This is your main dashboard. Everything you need to run your restaurant is accessible from here — stats, orders, platforms, and navigation above.',
    placement: 'bottom',
  },
  {
    targetId:  'stats-grid',
    title:     'Live Business Stats',
    body:      'These numbers update in real time. See how many orders came in today, your revenue, all-time totals, and how many menu items are active.',
    placement: 'bottom',
  },
  {
    targetId:  'quick-actions',
    title:     'Quick Actions',
    body:      'Jump directly to your orders list or menu management with these buttons. More shortcuts will appear as you enable more features.',
    placement: 'bottom',
  },
  {
    targetId:  'platform-connections',
    title:     'Platform Connections',
    body:      'Connect your ad accounts and social media pages here. Once connected, you can run campaigns and publish posts without leaving your portal.',
    placement: 'top',
  },
  {
    targetId:  'recent-orders',
    title:     'Recent Orders',
    body:      'All incoming orders — phone, delivery, online — show up here automatically. Click "View All Orders" to see the full list and manage order statuses.',
    placement: 'top',
  },
  {
    targetId:  'portal-nav',
    title:     'Navigation Menu',
    body:      'All your tools are in the top navigation bar. Ads, Social Media, Accounting, Delivery, AI Creative — each section gets its own dedicated page.',
    placement: 'bottom',
  },
  {
    targetId:  'customize-btn',
    title:     'Customize Your Portal',
    body:      'Click here to change your accent color, upload a logo, set a banner image, add a welcome message, or enable dark mode.',
    placement: 'bottom',
  },
  {
    targetId:  'chatbot-bubble',
    title:     'Your AI Assistant',
    body:      "This floating bubble is your AI chat assistant. It knows your live stats and can answer any question about the platform. Click it anytime to get help.",
    placement: 'top',
  },
]

// ── Small helpers ──────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accentColor }: { label: string; value: string; sub?: string; accentColor?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold mt-1" style={{ color: accentColor ?? '#111827' }}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function statusColor(s: string) {
  return s === 'confirmed' ? 'text-green-600' : s === 'pending' ? 'text-amber-500' : 'text-gray-400'
}

function parseItems(raw: string | null): string {
  if (!raw) return '—'
  try {
    const items = JSON.parse(raw) as Array<{ name: string; qty: number }>
    return items.map(i => `${i.name}${i.qty !== 1 ? ` ×${i.qty}` : ''}`).join(', ')
  } catch { return raw }
}

// ── PlatformTile ───────────────────────────────────────────────────────────────

function PlatformTile({
  icon, label, color, fgDark, desc, configured, connected, onConnect, connecting,
}: {
  icon: string; label: string; color: string; fgDark?: boolean; desc: string
  configured: boolean; connected: boolean
  onConnect?: () => void; connecting?: boolean
}) {
  return (
    <div className={`bg-white rounded-xl border-2 p-4 flex flex-col gap-2 transition-colors ${connected ? 'border-green-200' : 'border-gray-200'}`}>
      <div className="flex items-center gap-2.5">
        <span
          className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm shrink-0"
          style={{ backgroundColor: color, color: fgDark ? '#111' : '#fff' }}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-900 leading-tight">{label}</p>
          <p className="text-xs text-gray-400 truncate">{desc}</p>
        </div>
      </div>
      {connected ? (
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
          <span className="text-xs text-green-600 font-medium">Connected</span>
        </div>
      ) : configured ? (
        <button
          onClick={onConnect}
          disabled={connecting}
          className="text-xs text-white py-1.5 rounded-lg transition-opacity disabled:opacity-50"
          style={{ backgroundColor: '#111827' }}
        >
          {connecting ? 'Redirecting…' : `Connect`}
        </button>
      ) : (
        <p className="text-xs text-gray-300 italic">Setup pending</p>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SlugDashboardPage() {
  const params = useParams<{ slug: string }>()
  const slug   = params?.slug ?? ''
  const router       = useRouter()
  const customization = useCustomization()

  type Analytics = Awaited<ReturnType<typeof api.portal.analytics>>
  const [data, setData]         = useState<PortalDashboard & { features: string[] } | null>(null)
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [adStatus, setAdStatus] = useState<Record<string, PlatformStatus>>({})
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [connecting, setConnecting] = useState<string | null>(null)
  const [showTour, setShowTour] = useState(false)
  const [analyticsTab, setAnalyticsTab] = useState<'revenue' | 'orders'>('revenue')

  useEffect(() => {
    Promise.all([
      api.portal.dashboard(),
      api.ads.status().catch(() => ({})),
      api.portal.analytics().catch(() => null),
    ]).then(([d, s, a]) => {
      setData(d)
      setAdStatus(s as Record<string, PlatformStatus>)
      setAnalytics(a)
    }).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [])

  // launch tour if ?tour=1 or not yet seen
  useEffect(() => {
    if (loading) return
    const wantsTour = new URLSearchParams(window.location.search).get('tour') === '1'
    const tourDone  = !!localStorage.getItem(`cs_tour_done_${slug}`)
    if (wantsTour || !tourDone) {
      setTimeout(() => setShowTour(true), 400)
    }
  }, [loading, slug])

  function finishTour() {
    if (typeof window !== 'undefined') localStorage.setItem(`cs_tour_done_${slug}`, '1')
    setShowTour(false)
    // clean URL
    window.history.replaceState({}, '', `/portal/${slug}/dashboard`)
  }

  async function connectAds(platform: string) {
    setConnecting(platform)
    try {
      const { oauth_url } = await api.ads.connectUrl(platform)
      window.location.href = oauth_url
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to start connection')
      setConnecting(null)
    }
  }

  if (loading) return <div className="text-sm text-gray-400 py-20 text-center">Loading…</div>
  if (error)   return <div className="text-sm text-red-500 bg-red-50 rounded-xl p-4 border border-red-200">{error}</div>
  if (!data)   return null

  const { stats, recent_orders, features } = data
  const accent = customization.accent_color || '#16a34a'

  const enabledAdPlatforms     = AD_PLATFORMS.filter(p => features.includes(`ads_${p.key}`))
  const enabledSocialPlatforms = SOCIAL_PLATFORMS.filter(p => features.includes(`social_${p.key}`))
  const hasGoogleMaps  = features.includes('listings_google')
  const hasAppleMaps   = features.includes('listings_apple')
  const hasAds         = enabledAdPlatforms.length > 0
  const hasSocial      = enabledSocialPlatforms.length > 0
  const hasListings    = hasGoogleMaps || hasAppleMaps
  const showConnections = hasAds || hasSocial || hasListings

  return (
    <>
      {data && (
        <FeedbackModal
          tenantId={data.tenant.id}
          restaurantName={data.tenant.name}
          accentColor={customization.accent_color}
        />
      )}
      {showTour && (
        <TourOverlay
          steps={TOUR_STEPS.filter(s => {
            // skip platform-connections step if section isn't rendered
            if (s.targetId === 'platform-connections' && !showConnections) return false
            return true
          })}
          accent={accent}
          onDone={finishTour}
        />
      )}

      <div className="space-y-8">
        {/* Banner */}
        {customization.banner_url && (
          <div className="rounded-2xl overflow-hidden h-40 relative">
            <img src={customization.banner_url} alt="banner" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/50 to-transparent flex items-end px-6 py-5">
              <div>
                {customization.welcome_msg && (
                  <p className="text-white text-lg font-semibold drop-shadow">{customization.welcome_msg}</p>
                )}
                <p className="text-white/80 text-sm mt-0.5">{data.tenant.name}</p>
              </div>
            </div>
          </div>
        )}

        {/* Welcome message (no banner) */}
        {!customization.banner_url && customization.welcome_msg && (
          <div className="rounded-xl px-5 py-3 text-white text-sm font-medium" style={{ backgroundColor: accent }}>
            {customization.welcome_msg}
          </div>
        )}

        <div className="flex items-center justify-between">
          <h1 data-tour-id="dashboard-title" className="text-xl font-bold text-gray-900">Dashboard</h1>
          <button
            onClick={() => setShowTour(true)}
            className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
            title="Replay feature tour"
          >
            <span>?</span> Tour
          </button>
        </div>

        {/* Stats */}
        <div data-tour-id="stats-grid" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Orders Today"  value={String(stats.today_orders)}  sub="from all channels" />
          <StatCard label="Revenue Today" value={`$${stats.today_revenue.toFixed(2)}`} accentColor={accent} />
          <StatCard label="Total Orders"  value={String(stats.total_orders)}  sub={`$${stats.total_revenue.toFixed(2)} lifetime`} />
          <StatCard label="Menu Items"    value={String(stats.menu_items)}    sub={`${stats.menu_active} active`} />
        </div>

        {/* Analytics */}
        {analytics && (
          <div className="space-y-4">
            {/* WoW comparison */}
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Orders this week', value: analytics.this_week.orders, prev: analytics.last_week.orders, fmt: (n: number) => String(n) },
                { label: 'Revenue this week', value: analytics.this_week.revenue, prev: analytics.last_week.revenue, fmt: (n: number) => `$${n.toFixed(2)}` },
              ].map(({ label, value, prev, fmt }) => {
                const pct  = prev > 0 ? Math.round((value - prev) / prev * 100) : null
                const up   = pct !== null && pct >= 0
                return (
                  <div key={label} className="bg-white rounded-xl border border-gray-200 px-5 py-4">
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</p>
                    <p className="text-2xl font-bold mt-1 text-gray-900">{fmt(value)}</p>
                    {pct !== null ? (
                      <p className={`text-xs mt-0.5 font-medium ${up ? 'text-green-600' : 'text-red-500'}`}>
                        {up ? '▲' : '▼'} {Math.abs(pct)}% vs last week
                      </p>
                    ) : (
                      <p className="text-xs mt-0.5 text-gray-400">No prior week data</p>
                    )}
                  </div>
                )
              })}
            </div>

            {/* 30-day chart */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-900">Last 30 Days</h2>
                <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                  {(['revenue', 'orders'] as const).map(tab => (
                    <button key={tab} onClick={() => setAnalyticsTab(tab)}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize ${analyticsTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                      {tab}
                    </button>
                  ))}
                </div>
              </div>
              {analyticsTab === 'revenue' ? (
                <LineChart
                  data={analytics.daily.map(d => ({ label: d.label, short: d.short, value: d.revenue }))}
                  color={accent}
                  height={160}
                  formatValue={n => `$${n.toFixed(0)}`}
                  showEvery={5}
                />
              ) : (
                <BarChart
                  data={analytics.daily.map(d => ({ label: d.label, short: d.short, value: d.orders }))}
                  color={accent}
                  height={160}
                  showEvery={5}
                />
              )}
            </div>

            {/* Order sources */}
            {analytics.sources.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-4">Order Sources</h2>
                <DonutChart
                  size={120}
                  data={analytics.sources.map((s, i) => ({
                    label: s.source,
                    value: s.count,
                    color: [accent, '#6366f1', '#f59e0b', '#ef4444', '#14b8a6'][i % 5],
                  }))}
                />
              </div>
            )}
          </div>
        )}

        {/* Quick links */}
        <div data-tour-id="quick-actions" className="flex gap-3 flex-wrap">
          <Link
            href={`/portal/${slug}/orders`}
            className="inline-flex items-center gap-1.5 text-white px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
            style={{ backgroundColor: accent }}
          >
            View All Orders
          </Link>
          <Link
            href={`/portal/${slug}/menu`}
            className="inline-flex items-center gap-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            View Menu
          </Link>
        </div>

        {/* Platform connections */}
        {showConnections && (
          <div data-tour-id="platform-connections">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-900">Platform Connections</h2>
              <span className="text-xs text-gray-400">Connect once — manage everywhere</span>
            </div>

            {hasAds && (
              <div className="mb-5">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Ad Platforms</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {enabledAdPlatforms.map(p => {
                    const s = adStatus[p.key]
                    return (
                      <PlatformTile
                        key={p.key}
                        icon={p.icon}
                        label={p.label}
                        color={p.color}
                        fgDark={'fgDark' in p ? p.fgDark : false}
                        desc={p.desc}
                        configured={!!s?.configured}
                        connected={!!s?.connected}
                        connecting={connecting === p.key}
                        onConnect={() => connectAds(p.key)}
                      />
                    )
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Go to <Link href={`/portal/${slug}/ads`} className="underline hover:text-gray-600">Advertising</Link> to create and manage campaigns.
                </p>
              </div>
            )}

            {hasSocial && (
              <div className="mb-5">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Social Media</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {enabledSocialPlatforms.map(p => {
                    const s = adStatus[p.key]
                    return (
                      <PlatformTile
                        key={p.key}
                        icon={p.icon}
                        label={p.label}
                        color={p.color}
                        desc={p.desc}
                        configured={!!s?.configured}
                        connected={!!s?.connected}
                        connecting={connecting === p.key}
                        onConnect={() => connectAds(p.key)}
                      />
                    )
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Go to <Link href={`/portal/${slug}/social`} className="underline hover:text-gray-600">Social</Link> to publish posts.
                </p>
              </div>
            )}

            {hasListings && (
              <div className="mb-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Maps & Listings</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {hasGoogleMaps && (
                    <div
                      className="bg-white rounded-xl border-2 border-gray-200 p-4 flex flex-col gap-2 cursor-pointer hover:border-gray-300 transition-colors"
                      onClick={() => router.push(`/portal/${slug}/business`)}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center text-white font-bold text-xs shrink-0">G</span>
                        <div>
                          <p className="text-xs font-semibold text-gray-900">Google Maps</p>
                          <p className="text-xs text-gray-400">Business Profile</p>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500">Manage your listing →</p>
                    </div>
                  )}
                  {hasAppleMaps && (
                    <div
                      className="bg-white rounded-xl border-2 border-gray-200 p-4 flex flex-col gap-2 cursor-pointer hover:border-gray-300 transition-colors"
                      onClick={() => router.push(`/portal/${slug}/business`)}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center text-white font-bold text-xs shrink-0">A</span>
                        <div>
                          <p className="text-xs font-semibold text-gray-900">Apple Maps</p>
                          <p className="text-xs text-gray-400">Business Connect</p>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500">Manage your listing →</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Recent Orders */}
        <div data-tour-id="recent-orders">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Recent Orders</h2>
          {recent_orders.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
              <p className="text-gray-400 text-sm">No orders yet.</p>
              <p className="text-gray-400 text-xs mt-1">Phone orders will appear here automatically.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {recent_orders.map((order: Order) => (
                <div key={order.id} className="flex items-center justify-between px-5 py-3 gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">#{order.external_order_id ?? order.id}</span>
                      <span className="text-xs text-gray-400 capitalize">{order.order_source}</span>
                    </div>
                    <p className="text-sm text-gray-700 mt-0.5 truncate">{parseItems(order.items)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-gray-900">${(order.total ?? 0).toFixed(2)}</p>
                    <p className={`text-xs capitalize ${statusColor(order.status)}`}>{order.status}</p>
                  </div>
                  <p className="text-xs text-gray-400 shrink-0 hidden sm:block">
                    {new Date(order.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
