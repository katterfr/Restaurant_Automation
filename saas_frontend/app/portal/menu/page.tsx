'use client'
import { useEffect, useState } from 'react'
import { api, MenuItem } from '@/lib/api'
import Link from 'next/link'

export default function PortalMenuPage() {
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.portal.menu()
      .then(setItems)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const grouped = items.reduce<Record<string, MenuItem[]>>((acc, item) => {
    const cat = item.category || 'Uncategorized'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div>
        <Link href="/portal/dashboard" className="text-sm text-gray-400 hover:text-gray-600">← Dashboard</Link>
        <h1 className="text-xl font-bold text-gray-900 mt-1">Menu</h1>
        <p className="text-sm text-gray-400 mt-0.5">Your current menu items. Contact your account manager to make changes.</p>
      </div>

      {loading && <div className="text-sm text-gray-400 py-12 text-center">Loading…</div>}
      {error && <div className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl p-4">{error}</div>}

      {!loading && !error && items.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400 text-sm">No menu items yet.</p>
        </div>
      )}

      {Object.entries(grouped).map(([category, categoryItems]) => (
        <div key={category}>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">{category}</h2>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {categoryItems.map(item => (
              <div key={item.id} className="flex items-center justify-between px-5 py-3.5 gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900">{item.name}</p>
                    {!item.available && (
                      <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Unavailable</span>
                    )}
                  </div>
                  {item.description && <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>}
                </div>
                <p className="text-sm font-semibold text-gray-900 shrink-0">${item.price.toFixed(2)}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
