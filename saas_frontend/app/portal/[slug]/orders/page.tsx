'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { api, Order } from '@/lib/api'
import Link from 'next/link'

function parseItems(raw: string | null): string {
  if (!raw) return '—'
  try {
    const items = JSON.parse(raw) as Array<{ name: string; qty: number }>
    return items.map(i => `${i.name}${i.qty !== 1 ? ` ×${i.qty}` : ''}`).join(', ')
  } catch { return raw }
}

function statusBadge(status: string) {
  const base = 'text-xs px-2 py-0.5 rounded-full capitalize font-medium'
  if (status === 'confirmed') return `${base} bg-green-100 text-green-700`
  if (status === 'pending')   return `${base} bg-amber-100 text-amber-700`
  return `${base} bg-gray-100 text-gray-500`
}

export default function SlugOrdersPage() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug ?? ''
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.portal.orders(100)
      .then(setOrders)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/portal/${slug}/dashboard`} className="text-sm text-gray-400 hover:text-gray-600">← Dashboard</Link>
          <h1 className="text-xl font-bold text-gray-900 mt-1">Orders</h1>
        </div>
      </div>

      {loading && <div className="text-sm text-gray-400 py-12 text-center">Loading…</div>}
      {error && <div className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl p-4">{error}</div>}

      {!loading && !error && orders.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400 text-sm">No orders yet.</p>
          <p className="text-gray-400 text-xs mt-1">Phone orders will appear here automatically.</p>
        </div>
      )}

      {!loading && orders.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {orders.map(order => (
            <div key={order.id} className="flex items-center justify-between px-5 py-3.5 gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">#{order.external_order_id ?? order.id}</span>
                  <span className="text-xs text-gray-400 capitalize">{order.order_source}</span>
                </div>
                <p className="text-sm text-gray-700 truncate">{parseItems(order.items)}</p>
                {order.notes && <p className="text-xs text-gray-400 mt-0.5">{order.notes}</p>}
              </div>
              <div className="text-right shrink-0 space-y-1">
                <p className="text-sm font-semibold text-gray-900">${(order.total ?? 0).toFixed(2)}</p>
                <span className={statusBadge(order.status)}>{order.status}</span>
              </div>
              <p className="text-xs text-gray-400 shrink-0 hidden sm:block w-20 text-right">
                {new Date(order.created_at).toLocaleDateString()}<br />
                <span className="text-gray-300">{new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
