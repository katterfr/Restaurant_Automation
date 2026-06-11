'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api, Tenant, TenantStats } from '@/lib/api'
import { BarChart, DonutChart } from '@/app/components/charts'

const planBadge: Record<string, string> = {
  starter:    'bg-blue-100 text-blue-700',
  pro:        'bg-purple-100 text-purple-700',
  business:   'bg-orange-100 text-orange-700',
  enterprise: 'bg-amber-100 text-amber-700',
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function DashboardPage() {
  type AdminAnalytics = Awaited<ReturnType<typeof api.tenants.analytics>>
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [stats, setStats] = useState<TenantStats | null>(null)
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api.tenants.list(), api.tenants.stats(), api.tenants.analytics().catch(() => null)])
      .then(([t, s, a]) => { setTenants(t); setStats(s); setAnalytics(a) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  async function deleteTenant(id: number, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    try {
      await api.tenants.delete(id)
      setTenants(prev => prev.filter(t => t.id !== id))
      setStats(prev => prev ? { ...prev, total: prev.total - 1, active: prev.active - 1 } : prev)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const topPlans = stats
    ? Object.entries(stats.plans).sort((a, b) => b[1] - a[1]).slice(0, 3)
    : []

  return (
    <div className="p-8">
      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
          <StatCard label="Total Tenants"  value={String(stats.total)} />
          <StatCard label="Active"         value={String(stats.active)} sub={`${stats.total - stats.active} inactive`} />
          <StatCard label="Monthly Revenue" value={`$${stats.mrr.toLocaleString()}`} sub="MRR estimate" />
          <StatCard
            label="Top Plan"
            value={topPlans[0]?.[0] ?? '—'}
            sub={topPlans.map(([p, n]) => `${p}: ${n}`).join(' · ')}
          />
        </div>
      )}

      {/* Analytics */}
      {analytics && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
          {/* Tenant growth bar chart */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Tenant Growth</h2>
                <p className="text-xs text-gray-400 mt-0.5">New sign-ups per month</p>
              </div>
            </div>
            <BarChart
              data={analytics.growth.map(g => ({ label: g.month, value: g.count }))}
              color="#2563eb"
              height={150}
              showEvery={1}
            />
          </div>

          {/* Plan distribution donut */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-gray-900">Plan Mix</h2>
              <p className="text-xs text-gray-400 mt-0.5">Active tenant distribution</p>
            </div>
            <DonutChart
              size={110}
              data={analytics.plan_distribution.map((p, i) => ({
                label: p.plan,
                value: p.count,
                color: ['#2563eb','#7c3aed','#ea580c','#16a34a'][i % 4],
              }))}
            />
            {analytics.plan_distribution.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-1">MRR by plan</p>
                {analytics.plan_distribution.map((p, i) => (
                  <div key={i} className="flex justify-between text-xs py-0.5">
                    <span className="capitalize text-gray-600">{p.plan}</span>
                    <span className="font-medium text-gray-900">${p.mrr.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tenants</h1>
          {!loading && (
            <p className="text-sm text-gray-500 mt-0.5">
              {tenants.length} total · {tenants.filter(t => t.status === 'active').length} active
            </p>
          )}
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
                <Link href={`/menu/${tenant.id}`} className="text-gray-500 hover:text-gray-700">
                  Menu
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
