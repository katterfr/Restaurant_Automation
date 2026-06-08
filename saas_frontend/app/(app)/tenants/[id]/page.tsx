'use client'
import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { api, Tenant, Plan, Subscription } from '@/lib/api'

const ALL_FEATURES: Record<string, string> = {
  ads:            'Social Media Advertising',
  social_posts:   'Social Media Posts',
  accounting:     'Accounting & Bookkeeping',
  menu_management:'Menu Management',
  delivery:       'Delivery Integrations',
}

export default function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const tenantId = parseInt(id)
  const router = useRouter()

  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [plans, setPlans] = useState<Record<string, Plan>>({})
  const [loading, setLoading] = useState(true)
  const [upgrading, setUpgrading] = useState(false)
  const [ownerForm, setOwnerForm] = useState({ email: '', password: '' })
  const [ownerSaving, setOwnerSaving] = useState(false)
  const [ownerMsg, setOwnerMsg] = useState('')
  const [features, setFeatures] = useState<Record<string, boolean>>({})
  const [togglingFeature, setTogglingFeature] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      api.tenants.get(tenantId),
      api.billing.subscription(tenantId),
      api.billing.plans(),
      api.adminFeatures.get(tenantId),
    ])
      .then(([t, s, p, f]) => { setTenant(t); setSubscription(s); setPlans(p); setFeatures(f) })
      .catch(() => router.replace('/dashboard'))
      .finally(() => setLoading(false))
  }, [tenantId, router])

  async function toggleFeature(feature: string) {
    setTogglingFeature(feature)
    try {
      const res = await api.adminFeatures.toggle(tenantId, feature)
      setFeatures(prev => ({ ...prev, [feature]: res.enabled }))
    } catch { /* ignore */ }
    finally { setTogglingFeature(null) }
  }

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

  async function createOwner(e: React.FormEvent) {
    e.preventDefault()
    setOwnerSaving(true)
    setOwnerMsg('')
    try {
      await api.portal.createOwner(tenantId, ownerForm.email, ownerForm.password)
      const portalUrl = `${window.location.origin}/portal/${tenant?.slug}/login`
      setOwnerMsg(`✓ Owner account created. Share this link: ${portalUrl}`)
      setOwnerForm({ email: '', password: '' })
    } catch (err: unknown) {
      setOwnerMsg(err instanceof Error ? err.message : 'Failed to create owner')
    } finally {
      setOwnerSaving(false)
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

      {/* Owner account card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Owner Portal Access</h2>
        <p className="text-xs text-gray-400 mb-4">
          Create login credentials for the restaurant owner. Their dedicated portal URL will be{' '}
          <span className="font-mono text-blue-600">/portal/{tenant.slug}/login</span>
        </p>
        <form onSubmit={createOwner} className="flex gap-3 flex-wrap">
          <input
            type="email"
            placeholder="owner@restaurant.com"
            value={ownerForm.email}
            onChange={e => setOwnerForm(p => ({ ...p, email: e.target.value }))}
            required
            className="flex-1 min-w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <input
            type="password"
            placeholder="Password (min 8 chars)"
            value={ownerForm.password}
            onChange={e => setOwnerForm(p => ({ ...p, password: e.target.value }))}
            required
            minLength={8}
            className="flex-1 min-w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button
            type="submit"
            disabled={ownerSaving}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shrink-0"
          >
            {ownerSaving ? 'Creating…' : 'Create Account'}
          </button>
        </form>
        {ownerMsg && (
          <p className={`mt-3 text-sm px-3 py-2 rounded-lg border ${ownerMsg.startsWith('✓') ? 'text-green-700 bg-green-50 border-green-200' : 'text-red-600 bg-red-50 border-red-200'}`}>
            {ownerMsg}
          </p>
        )}
      </div>

      {/* Feature flags card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Feature Access</h2>
        <p className="text-xs text-gray-400 mb-4">Enable or disable features for this restaurant's owner portal.</p>
        <div className="space-y-3">
          {Object.entries(ALL_FEATURES).map(([key, label]) => {
            const enabled = !!features[key]
            const toggling = togglingFeature === key
            return (
              <div key={key} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{label}</p>
                  <p className="text-xs text-gray-400 capitalize">{key.replace('_', ' ')}</p>
                </div>
                <button
                  onClick={() => toggleFeature(key)}
                  disabled={toggling}
                  className={`w-12 h-6 rounded-full transition-colors relative disabled:opacity-50 ${enabled ? 'bg-green-500' : 'bg-gray-300'}`}
                  title={enabled ? 'Disable' : 'Enable'}
                >
                  <span className={`block w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-transform ${enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </div>
            )
          })}
        </div>
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
