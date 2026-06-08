'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api, Tenant } from '@/lib/api'

const planBadge: Record<string, string> = {
  starter: 'bg-blue-100 text-blue-700',
  pro: 'bg-purple-100 text-purple-700',
  enterprise: 'bg-amber-100 text-amber-700',
}

export default function DashboardPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.tenants.list()
      .then(setTenants)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  async function deleteTenant(id: number, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    try {
      await api.tenants.delete(id)
      setTenants(prev => prev.filter(t => t.id !== id))
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const active = tenants.filter(t => t.status === 'active').length

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tenants</h1>
          <p className="text-sm text-gray-500 mt-1">
            {tenants.length} total · {active} active
          </p>
        </div>
        <Link
          href="/tenants/new"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Add Tenant
        </Link>
      </div>

      {loading && <p className="text-gray-400 text-sm">Loading…</p>}
      {error && <p className="text-red-500 text-sm">{error}</p>}

      {!loading && tenants.length === 0 && !error && (
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-200">
          <p className="text-gray-500 text-sm">No tenants yet.</p>
          <Link href="/tenants/new" className="text-blue-600 text-sm mt-2 inline-block hover:underline">
            Add your first tenant →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {tenants.map(tenant => (
          <div key={tenant.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-900 truncate">{tenant.name}</h3>
                <p className="text-xs text-gray-400 mt-0.5 truncate">{tenant.slug}</p>
              </div>
              <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${planBadge[tenant.plan] ?? 'bg-gray-100 text-gray-600'}`}>
                {tenant.plan}
              </span>
            </div>
            <div className="mt-4 flex items-center justify-between text-xs">
              <span className={tenant.status === 'active' ? 'text-green-600' : 'text-gray-400'}>
                ● {tenant.status}
              </span>
              <div className="flex gap-3">
                <Link href={`/tenants/${tenant.id}`} className="text-blue-600 hover:underline">
                  Manage →
                </Link>
                <button
                  onClick={() => deleteTenant(tenant.id, tenant.name)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
