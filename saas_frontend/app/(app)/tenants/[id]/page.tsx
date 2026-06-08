'use client'
import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { api, Tenant, Plan, Subscription } from '@/lib/api'

export default function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const tenantId = parseInt(id)
  const router = useRouter()

  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [plans, setPlans] = useState<Record<string, Plan>>({})
  const [loading, setLoading] = useState(true)
  const [upgrading, setUpgrading] = useState(false)

  useEffect(() => {
    Promise.all([
      api.tenants.get(tenantId),
      api.billing.subscription(tenantId),
      api.billing.plans(),
    ])
      .then(([t, s, p]) => { setTenant(t); setSubscription(s); setPlans(p) })
      .catch(() => router.replace('/dashboard'))
      .finally(() => setLoading(false))
  }, [tenantId, router])

  async function upgradePlan(plan: string) {
    if (!confirm(`Switch to ${plan} plan?`)) return
    setUpgrading(true)
    try {
      await api.billing.upgrade(tenantId, plan)
      const [t, s] = await Promise.all([api.tenants.get(tenantId), api.billing.subscription(tenantId)])
      setTenant(t)
      setSubscription(s)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Upgrade failed')
    } finally {
      setUpgrading(false)
    }
  }

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading…</div>
  if (!tenant || !subscription) return null

  return (
    <div className="p-8 max-w-3xl">
      {/* Breadcrumb */}
      <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">← Dashboard</Link>
      <div className="mt-3 mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{tenant.name}</h1>
        <p className="text-sm text-gray-400 mt-0.5">/{tenant.slug}</p>
      </div>

      {/* Details card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Details</h2>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-400 text-xs mb-0.5">Tenant ID</dt>
            <dd className="font-medium text-gray-900">{tenant.id}</dd>
          </div>
          <div>
            <dt className="text-gray-400 text-xs mb-0.5">Status</dt>
            <dd className={`font-medium capitalize ${tenant.status === 'active' ? 'text-green-600' : 'text-gray-500'}`}>
              {tenant.status}
            </dd>
          </div>
          <div>
            <dt className="text-gray-400 text-xs mb-0.5">Current Plan</dt>
            <dd className="font-medium text-gray-900 capitalize">{tenant.plan}</dd>
          </div>
          <div>
            <dt className="text-gray-400 text-xs mb-0.5">Created</dt>
            <dd className="font-medium text-gray-900">{new Date(tenant.created_at).toLocaleDateString()}</dd>
          </div>
        </dl>
      </div>

      {/* Plans card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-5">Subscription</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Object.entries(plans).map(([key, plan]) => {
            const isCurrent = key === subscription.plan
            return (
              <div
                key={key}
                className={`rounded-xl border-2 p-4 transition-colors ${
                  isCurrent ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900 text-sm">{plan.name}</h3>
                  {isCurrent && (
                    <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">Active</span>
                  )}
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  ${plan.price_monthly}
                  <span className="text-xs font-normal text-gray-400">/mo</span>
                </p>
                <ul className="mt-3 space-y-1.5">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-1.5 text-xs text-gray-600">
                      <span className="text-green-500 mt-0.5 shrink-0">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                {!isCurrent && (
                  <button
                    onClick={() => upgradePlan(key)}
                    disabled={upgrading}
                    className="mt-4 w-full bg-gray-900 hover:bg-gray-700 disabled:opacity-40 text-white text-xs py-2 rounded-lg transition-colors"
                  >
                    {upgrading ? '…' : `Switch to ${plan.name}`}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
