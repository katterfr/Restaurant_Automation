'use client'
import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { api, Tenant, Plan, Subscription, TeamMember } from '@/lib/api'

const FEATURE_GROUPS = [
  {
    label: 'Ad Platforms',
    desc: 'Which ad networks this restaurant can connect and run campaigns on',
    items: [
      { key: 'ads_meta',      label: 'Meta Ads',      desc: 'Facebook & Instagram advertising' },
      { key: 'ads_google',    label: 'Google Ads',     desc: 'Search & Display advertising' },
      { key: 'ads_youtube',   label: 'YouTube Ads',    desc: 'YouTube video ad campaigns' },
      { key: 'ads_tiktok',    label: 'TikTok Ads',     desc: 'In-Feed video advertising' },
      { key: 'ads_snapchat',  label: 'Snapchat Ads',   desc: 'Story & Snap advertising' },
      { key: 'ads_pinterest', label: 'Pinterest Ads',  desc: 'Promoted Pins advertising' },
    ],
  },
  {
    label: 'Social Media Posting',
    desc: 'Which platforms the owner can publish organic posts to',
    items: [
      { key: 'social_meta',    label: 'Meta Social',    desc: 'Facebook Page & Instagram posts' },
      { key: 'social_youtube', label: 'YouTube Social', desc: 'YouTube channel video uploads' },
      { key: 'social_tiktok',  label: 'TikTok Social',  desc: 'TikTok posts & videos' },
    ],
  },
  {
    label: 'Business Listings',
    desc: 'Map and directory listings for this restaurant',
    items: [
      { key: 'listings_google', label: 'Google Maps',  desc: 'Google Business Profile listing' },
      { key: 'listings_apple',  label: 'Apple Maps',   desc: 'Apple Business Connect listing' },
    ],
  },
  {
    label: 'Other Features',
    desc: 'Additional tools available in the owner portal',
    items: [
      { key: 'phone_agent',     label: 'AI Phone Agent',     desc: 'AI voice ordering via phone' },
      { key: 'ai_creative',     label: 'AI Creative Studio',  desc: 'AI-generated ad images & videos' },
      { key: 'accounting',      label: 'Accounting',          desc: 'Revenue & expense tracking' },
      { key: 'menu_management', label: 'Menu Management',     desc: 'Advanced menu controls' },
      { key: 'delivery',        label: 'Delivery Integrations', desc: 'DoorDash, Uber Eats, etc.' },
    ],
  },
]

const ROLE_COLORS: Record<string, string> = {
  manager:   'bg-purple-100 text-purple-700',
  marketing: 'bg-blue-100 text-blue-700',
  staff:     'bg-amber-100 text-amber-700',
  viewer:    'bg-gray-100 text-gray-500',
  owner:     'bg-green-100 text-green-700',
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${ROLE_COLORS[role] ?? 'bg-gray-100 text-gray-500'}`}>
      {role}
    </span>
  )
}

function EditMemberRow({ member, allPages, roleDefaults, onSave, onCancel }: {
  member: TeamMember; allPages: string[]; roleDefaults: Record<string, string[]>
  onSave: (role: string, perms: string[]) => void; onCancel: () => void
}) {
  const [role, setRole]   = useState(member.role)
  const [perms, setPerms] = useState<string[]>(member.permissions)
  const [msg, setMsg] = useState('')
  const toggle = (pg: string) => setPerms(p => p.includes(pg) ? p.filter(x => x !== pg) : [...p, pg])
  // Role change no longer auto-resets permissions — use the button to apply defaults explicitly
  return (
    <div className="p-4 bg-blue-50 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <select className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={role} onChange={e => setRole(e.target.value)}>
          <option value="manager">Manager</option>
          <option value="marketing">Marketing</option>
          <option value="staff">Staff</option>
          <option value="viewer">Viewer</option>
        </select>
        <button type="button" onClick={() => setPerms(roleDefaults[role] ?? [])}
          className="text-xs text-blue-600 border border-blue-300 bg-white px-2.5 py-1 rounded-lg hover:bg-blue-50 transition-colors">
          Apply role defaults
        </button>
        <p className="text-xs text-gray-400">Role change alone won&apos;t reset permissions.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {allPages.map(pg => (
          <label key={pg} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs cursor-pointer transition-colors
            ${perms.includes(pg) ? 'border-blue-500 bg-blue-100 text-blue-700' : 'border-gray-200 text-gray-500 bg-white'}`}>
            <input type="checkbox" className="sr-only" checked={perms.includes(pg)} onChange={() => toggle(pg)}/>
            {pg}
          </label>
        ))}
      </div>
      {msg && <p className={`text-xs ${msg.startsWith('✓') ? 'text-green-700' : 'text-red-600'}`}>{msg}</p>}
      <div className="flex gap-2">
        <button onClick={() => { onSave(role, perms); setMsg('') }}
          className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors">Save</button>
        <button onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
      </div>
    </div>
  )
}

function ResetPasswordRow({ userId, tenantId, onDone, onCancel }: {
  userId: number; tenantId: number; onDone: () => void; onCancel: () => void
}) {
  const [pw, setPw]   = useState('')
  const [pw2, setPw2] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  async function handleSave() {
    if (pw.length < 8)  { setMsg('Password must be at least 8 characters'); return }
    if (pw !== pw2)     { setMsg('Passwords do not match'); return }
    setSaving(true); setMsg('')
    try {
      await api.team.resetPassword(tenantId, userId, pw)
      onDone()
    } catch (err: unknown) { setMsg(err instanceof Error ? err.message : 'Failed') }
    finally { setSaving(false) }
  }

  return (
    <div className="p-4 bg-amber-50 space-y-3">
      <p className="text-xs font-semibold text-amber-800">Set New Password</p>
      <div className="flex gap-3 flex-wrap">
        <input type="password" placeholder="New password (min 8)" value={pw} onChange={e => setPw(e.target.value)}
          className="flex-1 min-w-40 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"/>
        <input type="password" placeholder="Confirm password" value={pw2} onChange={e => setPw2(e.target.value)}
          className="flex-1 min-w-40 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"/>
      </div>
      {msg && <p className="text-xs text-red-600">{msg}</p>}
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving}
          className="text-xs bg-amber-600 text-white px-3 py-1.5 rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors">
          {saving ? 'Saving…' : 'Set Password'}
        </button>
        <button onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
      </div>
    </div>
  )
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
  const [editForm, setEditForm] = useState({ name: '', slug: '' })
  const [editSaving, setEditSaving] = useState(false)
  const [editMsg, setEditMsg] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  // team management
  const [team, setTeam]           = useState<TeamMember[]>([])
  const [showAddMember, setShowAddMember] = useState(false)
  const [memberForm, setMemberForm] = useState({ display_name: '', email: '', password: '', role: 'staff', permissions: [] as string[] })
  const [memberSaving, setMemberSaving] = useState(false)
  const [memberMsg, setMemberMsg] = useState('')
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null)
  const [resetPasswordFor, setResetPasswordFor] = useState<number | null>(null)
  const [resetPwDoneMsg, setResetPwDoneMsg] = useState('')
  // owner accounts
  const [ownerAccounts, setOwnerAccounts] = useState<Array<{ id: number; email: string; display_name: string; role: string; created_at: string }>>([])
  const [resetOwnerPasswordFor, setResetOwnerPasswordFor] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([
      api.tenants.get(tenantId),
      api.billing.subscription(tenantId),
      api.billing.plans(),
      api.adminFeatures.get(tenantId),
    ])
      .then(([t, s, p, f]) => {
        setTenant(t); setSubscription(s); setPlans(p); setFeatures(f)
        setEditForm({ name: t.name, slug: t.slug })
      })
      .catch(() => router.replace('/dashboard'))
      .finally(() => setLoading(false))
    api.team.list(parseInt(id)).then(setTeam).catch(() => {})
    api.team.listOwners(parseInt(id)).then(setOwnerAccounts).catch(() => {})
  }, [tenantId, router])

  async function syncPlanFeatures() {
    setSyncing(true); setSyncMsg('')
    try {
      const res = await api.tenants.syncFeatures(tenantId)
      const updated = await api.adminFeatures.get(tenantId)
      setFeatures(updated)
      setSyncMsg(`✓ Features synced for ${res.plan} plan`)
    } catch (err: unknown) {
      setSyncMsg(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    setEditSaving(true)
    setEditMsg('')
    try {
      const updated = await api.tenants.patch(tenantId, { name: editForm.name, slug: editForm.slug })
      setTenant(updated)
      setEditMsg(`✓ Saved — new portal URL: /portal/${updated.slug}/dashboard`)
    } catch (err: unknown) {
      setEditMsg(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setEditSaving(false)
    }
  }

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
      api.team.listOwners(tenantId).then(setOwnerAccounts).catch(() => {})
    } catch (err: unknown) {
      setOwnerMsg(err instanceof Error ? err.message : 'Failed to create owner')
    } finally {
      setOwnerSaving(false)
    }
  }

  const ROLE_DEFAULTS: Record<string, string[]> = {
    manager:   ['dashboard','orders','menu','ads','social','accounting','delivery','business','phone','creative'],
    marketing: ['dashboard','ads','social','creative'],
    staff:     ['dashboard','orders','menu'],
    viewer:    ['dashboard'],
  }

  const ALL_PAGES = ['dashboard','orders','menu','ads','social','accounting','delivery','business','phone','creative']

  async function addMember(e: React.FormEvent) {
    e.preventDefault()
    setMemberSaving(true); setMemberMsg('')
    try {
      const m = await api.team.create(tenantId, { ...memberForm, permissions: memberForm.permissions.length ? memberForm.permissions : ROLE_DEFAULTS[memberForm.role] ?? [] })
      setTeam(t => [...t, m])
      setMemberForm({ display_name: '', email: '', password: '', role: 'staff', permissions: [] })
      setShowAddMember(false)
      setMemberMsg('✓ Team member created')
    } catch (err: unknown) { setMemberMsg(err instanceof Error ? err.message : 'Failed') }
    finally { setMemberSaving(false) }
  }

  async function saveMember(m: TeamMember, role: string, permissions: string[]) {
    try {
      const updated = await api.team.update(tenantId, m.id, { role, permissions })
      setTeam(t => t.map(x => x.id === m.id ? updated : x))
      setEditingMember(null)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  async function removeMember(uid: number) {
    if (!confirm('Remove this team member? They will lose portal access immediately.')) return
    await api.team.remove(tenantId, uid)
    setTeam(t => t.filter(m => m.id !== uid))
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
            <dd className="flex items-center gap-3 flex-wrap">
              <span className="font-medium text-gray-900 capitalize">{tenant.plan}</span>
              <button
                onClick={syncPlanFeatures}
                disabled={syncing}
                className="text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-2.5 py-1 rounded-lg transition-colors"
              >
                {syncing ? 'Syncing…' : '⟳ Sync Plan Features'}
              </button>
            </dd>
          </div>
          <div>
            <dt className="text-gray-400 text-xs mb-0.5">Created</dt>
            <dd className="font-medium text-gray-900">{new Date(tenant.created_at).toLocaleDateString()}</dd>
          </div>
        </dl>
        {syncMsg && (
          <p className={`mt-3 text-sm px-3 py-2 rounded-lg border ${syncMsg.startsWith('✓') ? 'text-green-700 bg-green-50 border-green-200' : 'text-red-600 bg-red-50 border-red-200'}`}>
            {syncMsg}
          </p>
        )}
      </div>

      {/* Edit name / slug card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Restaurant Name &amp; Slug</h2>
        <p className="text-xs text-gray-400 mb-4">
          The slug must be lowercase letters, numbers, and hyphens only — no spaces or slashes.
          Changing it updates the owner portal URL.
        </p>
        <form onSubmit={saveEdit} className="space-y-3">
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-48">
              <label className="block text-xs text-gray-500 mb-1">Restaurant Name</label>
              <input
                type="text"
                value={editForm.name}
                onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div className="flex-1 min-w-48">
              <label className="block text-xs text-gray-500 mb-1">Portal Slug</label>
              <input
                type="text"
                value={editForm.slug}
                onChange={e => setEditForm(p => ({ ...p, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
                required
                pattern="[a-z0-9][a-z0-9\-]{0,62}"
                title="Lowercase letters, numbers, and hyphens only"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 font-mono"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={editSaving}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {editSaving ? 'Saving…' : 'Save'}
            </button>
            {editMsg && (
              <p className={`text-sm ${editMsg.startsWith('✓') ? 'text-green-700' : 'text-red-600'}`}>{editMsg}</p>
            )}
          </div>
        </form>
      </div>

      {/* Owner account card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Owner Portal Access</h2>
        <p className="text-xs text-gray-400 mb-4">
          Manage login credentials for the restaurant owner. Portal URL:{' '}
          <span className="font-mono text-blue-600">/portal/{tenant.slug}/login</span>
        </p>

        {/* Existing owner accounts */}
        {ownerAccounts.length > 0 && (
          <div className="mb-5 space-y-2">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Existing Owner Accounts</p>
            {ownerAccounts.map(o => (
              <div key={o.id} className="border border-gray-200 rounded-xl overflow-hidden">
                {resetOwnerPasswordFor === o.id ? (
                  <ResetPasswordRow
                    userId={o.id} tenantId={tenantId}
                    onDone={() => { setResetOwnerPasswordFor(null); setOwnerMsg(`✓ Password updated for ${o.email}`) }}
                    onCancel={() => setResetOwnerPasswordFor(null)}
                  />
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white bg-green-500 shrink-0">
                      {o.email[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900">{o.email}</p>
                        <RoleBadge role="owner"/>
                      </div>
                      <p className="text-xs text-gray-400">Created {new Date(o.created_at).toLocaleDateString()}</p>
                    </div>
                    <button
                      onClick={() => { setResetOwnerPasswordFor(o.id); setOwnerMsg('') }}
                      className="text-xs text-amber-600 hover:underline shrink-0">
                      Reset Password
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Create new owner */}
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
          {ownerAccounts.length > 0 ? 'Add Another Owner' : 'Create Owner Login'}
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
        <p className="text-xs text-gray-400 mb-5">Enable or disable individual platforms and features for this restaurant's owner portal.</p>
        <div className="space-y-6">
          {FEATURE_GROUPS.map(group => (
            <div key={group.label}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{group.label}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => group.items.forEach(i => { if (!features[i.key]) toggleFeature(i.key) })}
                    className="text-xs text-green-700 hover:underline"
                  >
                    Enable all
                  </button>
                  <span className="text-gray-300">·</span>
                  <button
                    onClick={() => group.items.forEach(i => { if (features[i.key]) toggleFeature(i.key) })}
                    className="text-xs text-gray-400 hover:underline"
                  >
                    Disable all
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-400 mb-3">{group.desc}</p>
              <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                {group.items.map(({ key, label, desc }) => {
                  const enabled = !!features[key]
                  const toggling = togglingFeature === key
                  return (
                    <div key={key} className="flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition-colors">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{label}</p>
                        <p className="text-xs text-gray-400">{desc}</p>
                      </div>
                      <button
                        onClick={() => toggleFeature(key)}
                        disabled={toggling}
                        className={`w-12 h-6 rounded-full transition-colors relative disabled:opacity-50 shrink-0 ml-4 ${enabled ? 'bg-green-500' : 'bg-gray-300'}`}
                        title={enabled ? 'Disable' : 'Enable'}
                      >
                        <span className={`block w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-transform ${enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Team Management */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-gray-900">Team Members</h2>
          <button onClick={() => setShowAddMember(o => !o)}
            className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg transition-colors">
            + Add Member
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-5">
          Give staff, managers, or marketing team access to the owner portal with limited permissions.
        </p>

        {/* Add member form */}
        {showAddMember && (
          <form onSubmit={addMember} className="border border-gray-200 rounded-xl p-4 mb-5 space-y-3 bg-gray-50">
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">New Team Member</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Name</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Jane Smith" value={memberForm.display_name}
                  onChange={e => setMemberForm(p => ({ ...p, display_name: e.target.value }))} required/>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Email</label>
                <input type="email" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="jane@restaurant.com" value={memberForm.email}
                  onChange={e => setMemberForm(p => ({ ...p, email: e.target.value }))} required/>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Password</label>
                <input type="password" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Min 8 characters" value={memberForm.password} minLength={8}
                  onChange={e => setMemberForm(p => ({ ...p, password: e.target.value }))} required/>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Role</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  value={memberForm.role}
                  onChange={e => setMemberForm(p => ({ ...p, role: e.target.value, permissions: [] }))}>
                  <option value="manager">Manager — Full Access</option>
                  <option value="marketing">Marketing — Ads &amp; Social</option>
                  <option value="staff">Staff — Orders &amp; Menu</option>
                  <option value="viewer">Viewer — Read Only</option>
                </select>
              </div>
            </div>
            {/* Permission override */}
            <div>
              <p className="text-xs text-gray-500 mb-2">Page Access <span className="text-gray-400">(leave blank to use role defaults)</span></p>
              <div className="flex flex-wrap gap-2">
                {ALL_PAGES.map(pg => {
                  const defaultPerms = ROLE_DEFAULTS[memberForm.role] ?? []
                  const checked = memberForm.permissions.length ? memberForm.permissions.includes(pg) : defaultPerms.includes(pg)
                  return (
                    <label key={pg} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs cursor-pointer transition-colors
                      ${checked ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-500'}`}>
                      <input type="checkbox" className="sr-only" checked={checked}
                        onChange={e => {
                          const base = memberForm.permissions.length ? memberForm.permissions : ROLE_DEFAULTS[memberForm.role] ?? []
                          setMemberForm(p => ({ ...p, permissions: e.target.checked ? [...base, pg] : base.filter(x => x !== pg) }))
                        }}/>
                      {pg}
                    </label>
                  )
                })}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button type="submit" disabled={memberSaving}
                className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                {memberSaving ? 'Creating…' : 'Create Member'}
              </button>
              <button type="button" onClick={() => setShowAddMember(false)} className="text-sm text-gray-400 hover:text-gray-600">Cancel</button>
            </div>
            {memberMsg && <p className={`text-sm ${memberMsg.startsWith('✓') ? 'text-green-700' : 'text-red-600'}`}>{memberMsg}</p>}
          </form>
        )}

        {/* Team list */}
        {team.length === 0 ? (
          <div className="border border-dashed border-gray-200 rounded-xl p-6 text-center">
            <p className="text-gray-400 text-sm">No team members yet.</p>
            <p className="text-gray-400 text-xs mt-1">Add staff, managers, or marketing team for limited portal access.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {team.map(m => (
              <div key={m.id} className="border border-gray-200 rounded-xl overflow-hidden">
                {editingMember?.id === m.id ? (
                  <EditMemberRow
                    member={m} allPages={ALL_PAGES} roleDefaults={ROLE_DEFAULTS}
                    onSave={(role, perms) => saveMember(m, role, perms)}
                    onCancel={() => setEditingMember(null)}
                  />
                ) : resetPasswordFor === m.id ? (
                  <ResetPasswordRow
                    userId={m.id} tenantId={tenantId}
                    onDone={() => { setResetPasswordFor(null); setResetPwDoneMsg(`✓ Password updated for ${m.display_name || m.email}`) }}
                    onCancel={() => setResetPasswordFor(null)}
                  />
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white bg-gray-400 shrink-0">
                      {(m.display_name || m.email)[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-gray-900">{m.display_name || m.email}</p>
                        <RoleBadge role={m.role}/>
                      </div>
                      <p className="text-xs text-gray-400 truncate">{m.email}</p>
                      <div className="flex gap-1 flex-wrap mt-1">
                        {m.permissions.slice(0, 6).map(p => (
                          <span key={p} className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{p}</span>
                        ))}
                        {m.permissions.length > 6 && <span className="text-xs text-gray-400">+{m.permissions.length - 6} more</span>}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => { setEditingMember(m); setResetPasswordFor(null) }} className="text-xs text-blue-600 hover:underline">Edit</button>
                      <button onClick={() => { setResetPasswordFor(m.id); setEditingMember(null); setResetPwDoneMsg('') }} className="text-xs text-amber-600 hover:underline">Reset Pwd</button>
                      <button onClick={() => removeMember(m.id)} className="text-xs text-red-500 hover:underline">Remove</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {resetPwDoneMsg && (
              <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{resetPwDoneMsg}</p>
            )}
          </div>
        )}
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
