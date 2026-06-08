'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { api, PortalDashboard, Order } from '@/lib/api'
import Link from 'next/link'

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accent ?? 'text-gray-900'}`}>{value}</p>
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

export default function SlugDashboardPage() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug ?? ''
  const [data, setData] = useState<PortalDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.portal.dashboard()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-sm text-gray-400 py-20 text-center">Loading…</div>
  if (error) return <div className="text-sm text-red-500 bg-red-50 rounded-xl p-4 border border-red-200">{error}</div>
  if (!data) return null

  const { stats, recent_orders } = data

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Orders Today"  value={String(stats.today_orders)}  sub="from all channels" />
        <StatCard label="Revenue Today" value={`$${stats.today_revenue.toFixed(2)}`} accent="text-green-600" />
        <StatCard label="Total Orders"  value={String(stats.total_orders)}  sub={`$${stats.total_revenue.toFixed(2)} lifetime`} />
        <StatCard label="Menu Items"    value={String(stats.menu_items)}    sub={`${stats.menu_active} active`} />
      </div>

      <div className="flex gap-3 flex-wrap">
        <Link href={`/portal/${slug}/orders`} className="inline-flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          View All Orders
        </Link>
        <Link href={`/portal/${slug}/menu`} className="inline-flex items-center gap-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          View Menu
        </Link>
      </div>

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
