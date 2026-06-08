'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api, PortalDashboard, Order, PlatformStatus } from '@/lib/api'
import { useCustomization } from '../tenant-context'
import Link from 'next/link'

// ── Platform metadata ──────────────────────────────────────────────────────────

const AD_PLATFORMS = [
  { key: 'meta',      label: 'Meta',      icon: 'f',  color: '#1877f2', desc: 'Facebook & Instagram Ads' },
  { key: 'google',    label: 'Google',    icon: 'G',  color: '#ea4335', desc: 'Search, Display & YouTube' },
  { key: 'tiktok',    label: 'TikTok',    icon: '▶',  color: '#111',    desc: 'In-Feed Video Ads' },
  { key: 'snapchat',  label: 'Snapchat',  icon: '👻', color: '#fffc00', fgDark: true, desc: 'Story & Snap Ads' },
  { key: 'pinterest', label: 'Pinterest', icon: 'P',  color: '#e60023', desc: 'Promoted Pins' },
] as const

const SOCIAL_PLATFORMS = [
  { key: 'meta',   label: 'Meta',   icon: 'f', color: '#1877f2', desc: 'Facebook & Instagram posts' },
  { key: 'tiktok', label: 'TikTok', icon: '▶', color: '#111',   desc: 'TikTok posts' },
] as const

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
  const slug = params?.slug ?? ''
  const router = useRouter()
  const customization = useCustomization()

  const [data, setData] = useState<PortalDashboard & { features: string[] } | null>(null)
  const [adStatus, setAdStatus] = useState<Record<string, PlatformStatus>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [connecting, setConnecting] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      api.portal.dashboard(),
      api.ads.status().catch(() => ({})),
    ]).then(([d, s]) => {
      setData(d)
      setAdStatus(s as Record<string, PlatformStatus>)
    }).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [])

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
  if (error) return <div className="text-sm text-red-500 bg-red-50 rounded-xl p-4 border border-red-200">{error}</div>
  if (!data) return null

  const { stats, recent_orders, features } = data
  const accent = customization.accent_color || '#16a34a'

  const hasAds     = features.includes('ads')
  const hasSocial  = features.includes('social_posts')
  const hasListings = features.includes('business_listings')
  const showConnections = hasAds || hasSocial || hasListings

  return (
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

      <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Orders Today"  value={String(stats.today_orders)}  sub="from all channels" />
        <StatCard label="Revenue Today" value={`$${stats.today_revenue.toFixed(2)}`} accentColor={accent} />
        <StatCard label="Total Orders"  value={String(stats.total_orders)}  sub={`$${stats.total_revenue.toFixed(2)} lifetime`} />
        <StatCard label="Menu Items"    value={String(stats.menu_items)}    sub={`${stats.menu_active} active`} />
      </div>

      {/* Quick links */}
      <div className="flex gap-3 flex-wrap">
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
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">Platform Connections</h2>
            <span className="text-xs text-gray-400">Connect once — manage everywhere</span>
          </div>

          {hasAds && (
            <div className="mb-5">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Ad Platforms</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {AD_PLATFORMS.map(p => {
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
                {SOCIAL_PLATFORMS.map(p => {
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
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recent Orders */}
      <div>
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
  )
}
