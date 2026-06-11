'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { api, AdCampaign, PlatformStatus } from '@/lib/api'

const PLATFORM_META = {
  meta:      { label: 'Meta',      icon: 'f',  color: 'bg-blue-600',    desc: 'Facebook + Instagram Ads' },
  google:    { label: 'Google',    icon: 'G',  color: 'bg-red-500',     desc: 'Search, Display & YouTube' },
  tiktok:    { label: 'TikTok',    icon: '▶',  color: 'bg-neutral-900', desc: 'In-Feed Video Ads' },
  snapchat:  { label: 'Snapchat',  icon: '👻', color: 'bg-yellow-400',  desc: 'Story & Snap Ads' },
  pinterest: { label: 'Pinterest', icon: 'P',  color: 'bg-red-600',     desc: 'Promoted Pins' },
}

// Per-platform credential field definitions
const CREDENTIAL_FIELDS: Record<string, {
  fields: Array<{ key: string; label: string; placeholder: string; hint: string; optional?: boolean }>
  helpUrl: string
  helpText: string
}> = {
  meta: {
    helpUrl: 'https://business.facebook.com/settings/system-users',
    helpText: 'Get a System User access token from Meta Business Suite → Settings → Users → System Users.',
    fields: [
      { key: 'access_token', label: 'Access Token', placeholder: 'EAAxxxxxxxxxxxxxxxxxxxxx', hint: 'Long-lived token from Meta Business Suite → System Users' },
      { key: 'account_id',   label: 'Ad Account ID', placeholder: 'act_123456789', hint: 'Found in Meta Ads Manager URL or Business Settings → Ad Accounts' },
      { key: 'page_id',      label: 'Facebook Page ID', placeholder: '123456789012345', hint: 'From your Page → About → Page ID (used for ad creatives)', optional: true },
    ],
  },
  google: {
    helpUrl: 'https://ads.google.com/nav/selectaccount',
    helpText: 'Use a Google Ads Manager Account. Get your OAuth access token from Google OAuth Playground.',
    fields: [
      { key: 'access_token', label: 'OAuth Access Token', placeholder: 'ya29.xxxxxxxxxxxxxxxx', hint: 'From Google OAuth Playground (accounts.google.com/o/oauth2/auth)' },
      { key: 'account_id',   label: 'Customer ID', placeholder: '1234567890', hint: 'Your 10-digit Google Ads Customer ID (no dashes) from the Ads Manager header' },
    ],
  },
  tiktok: {
    helpUrl: 'https://business.tiktok.com/portal/bc/main',
    helpText: 'Create an app in TikTok for Business Developer Console, then authorize it to get an access token.',
    fields: [
      { key: 'access_token', label: 'Access Token', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', hint: 'From TikTok Business Center → Tools → API' },
      { key: 'account_id',   label: 'Advertiser ID', placeholder: '7012345678901234567', hint: 'Found in TikTok Ads Manager URL after /advertiser/' },
    ],
  },
  snapchat: {
    helpUrl: 'https://business.snapchat.com',
    helpText: 'Create an app in Snap Business Manager and generate an OAuth access token.',
    fields: [
      { key: 'access_token', label: 'Access Token', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', hint: 'From Snap Business Manager → Business Details → OAuth Tokens' },
      { key: 'account_id',   label: 'Ad Account ID', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', hint: 'Found in Snap Ads Manager URL or Business Manager → Ad Accounts' },
    ],
  },
  pinterest: {
    helpUrl: 'https://business.pinterest.com/en-us/tools/ad-manager',
    helpText: 'Create a Pinterest app at developers.pinterest.com and complete OAuth to get your access token.',
    fields: [
      { key: 'access_token', label: 'Access Token', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', hint: 'From Pinterest Developer portal → Apps → OAuth tokens' },
      { key: 'account_id',   label: 'Ad Account ID', placeholder: '549755813599', hint: 'Numeric ID found in Pinterest Ads Manager URL' },
    ],
  },
}

function statusBadge(status: string) {
  const base = 'text-xs px-2 py-0.5 rounded-full font-medium capitalize'
  if (status === 'active')         return `${base} bg-green-100 text-green-700`
  if (status === 'pending')        return `${base} bg-amber-100 text-amber-700`
  if (status === 'failed')         return `${base} bg-red-100 text-red-600`
  if (status === 'not_configured') return `${base} bg-gray-100 text-gray-500`
  if (status === 'not_connected')  return `${base} bg-yellow-100 text-yellow-700`
  if (status === 'cancelled')      return `${base} bg-gray-100 text-gray-400`
  return `${base} bg-gray-100 text-gray-500`
}

// ── Credential drawer ─────────────────────────────────────────────────────────

function CredentialDrawer({
  platform,
  existing,
  accent,
  onSaved,
  onClose,
}: {
  platform: string
  existing: PlatformStatus | undefined
  accent: string
  onSaved: () => void
  onClose: () => void
}) {
  const meta = PLATFORM_META[platform as keyof typeof PLATFORM_META]
  const cfg = CREDENTIAL_FIELDS[platform]
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!meta || !cfg) return null

  function set(key: string, val: string) {
    setValues(prev => ({ ...prev, [key]: val }))
  }

  async function save() {
    const accessToken = values.access_token?.trim()
    const accountId   = values.account_id?.trim()
    if (!accessToken || !accountId) { setError('Access Token and Account ID are required'); return }
    setSaving(true); setError('')
    try {
      await api.ads.saveCredentials(platform, {
        access_token: accessToken,
        account_id:   accountId,
        page_id:      values.page_id?.trim() || undefined,
      })
      onSaved()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md h-full shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <span className={`w-9 h-9 ${meta.color} rounded-lg flex items-center justify-center text-white font-bold text-sm`}>
              {meta.icon}
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900">{meta.label} Credentials</p>
              <p className="text-xs text-gray-400">{meta.desc}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Help banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
            <p className="text-xs text-blue-700">{cfg.helpText}</p>
            <a href={cfg.helpUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 font-medium hover:underline mt-1 block">
              Open {meta.label} Business Portal →
            </a>
          </div>

          {/* Already connected notice */}
          {existing?.connected && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full shrink-0" />
              <p className="text-xs text-green-700 font-medium">Already connected. Submitting new credentials will replace them.</p>
            </div>
          )}

          {/* Fields */}
          {cfg.fields.map(f => (
            <div key={f.key}>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                {f.label}
                {f.optional && <span className="font-normal text-gray-400 ml-1">(optional)</span>}
              </label>
              <input
                type="text"
                value={values[f.key] ?? ''}
                onChange={e => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:border-transparent"
              />
              <p className="text-xs text-gray-400 mt-1">{f.hint}</p>
            </div>
          ))}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 text-sm text-white py-2.5 rounded-xl font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity"
            style={{ backgroundColor: accent }}
          >
            {saving ? 'Saving…' : existing?.connected ? 'Update Credentials' : 'Connect'}
          </button>
          <button onClick={onClose} className="px-4 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdsPage() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug ?? ''
  const searchParams = useSearchParams()
  const justConnected = searchParams.get('connected')

  const [status, setStatus]       = useState<Record<string, PlatformStatus>>({})
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([])
  const [loading, setLoading]     = useState(true)
  const [configuringPlatform, setConfiguringPlatform] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [toast, setToast]         = useState('')
  const [accent, setAccent]       = useState('#16a34a')

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([api.ads.status(), api.ads.campaigns()])
      setStatus(s)
      setCampaigns(c)
    } catch { /* handled by layout auth */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    api.portal.customization().then(c => { if (c.accent_color) setAccent(c.accent_color) }).catch(() => {})
  }, [])

  useEffect(() => {
    if (justConnected) {
      const name = PLATFORM_META[justConnected as keyof typeof PLATFORM_META]?.label ?? justConnected
      setToast(`${name} connected successfully!`)
      setTimeout(() => setToast(''), 4000)
    }
  }, [justConnected])

  async function disconnectPlatform(platform: string) {
    if (!confirm(`Disconnect ${PLATFORM_META[platform as keyof typeof PLATFORM_META]?.label ?? platform}?`)) return
    setDisconnecting(platform)
    try {
      await api.ads.disconnect(platform)
      await load()
      setToast(`${PLATFORM_META[platform as keyof typeof PLATFORM_META]?.label} disconnected`)
      setTimeout(() => setToast(''), 3000)
    } catch { /* ignore */ }
    finally { setDisconnecting(null) }
  }

  async function cancelCampaign(id: number) {
    if (!confirm('Cancel this campaign?')) return
    await api.ads.cancel(id)
    await load()
  }

  if (loading) return <div className="text-sm text-gray-400 py-20 text-center">Loading…</div>

  const totalSpend    = campaigns.reduce((s, c) => s + (c.spend ?? 0), 0)
  const activeCampaigns = campaigns.filter(c => c.status === 'active').length

  return (
    <div className="space-y-8">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 bg-green-600 text-white px-4 py-3 rounded-xl shadow-lg text-sm z-50 flex items-center gap-2">
          <span>✓</span> {toast}
        </div>
      )}

      {/* Credential drawer */}
      {configuringPlatform && (
        <CredentialDrawer
          platform={configuringPlatform}
          existing={status[configuringPlatform]}
          accent={accent}
          onSaved={async () => { await load(); setToast(`${PLATFORM_META[configuringPlatform as keyof typeof PLATFORM_META]?.label} connected!`); setTimeout(() => setToast(''), 3000) }}
          onClose={() => setConfiguringPlatform(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Advertising</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {activeCampaigns} active campaign{activeCampaigns !== 1 ? 's' : ''} · ${totalSpend.toFixed(2)} total spend
          </p>
        </div>
        <Link
          href={`/portal/${slug}/ads/new`}
          className="text-white px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
          style={{ backgroundColor: accent }}
        >
          + Create Campaign
        </Link>
      </div>

      {/* Platform connections */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Platform Connections</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Object.entries(PLATFORM_META).map(([key, meta]) => {
            const s = status[key]
            const isConnected = s?.connected

            return (
              <div
                key={key}
                className={`bg-white rounded-xl border-2 p-4 transition-colors ${isConnected ? 'border-green-200' : 'border-gray-200'}`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className={`w-9 h-9 ${meta.color} rounded-lg flex items-center justify-center text-white font-bold text-sm`}>
                    {meta.icon}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{meta.label}</p>
                    <p className="text-xs text-gray-400">{meta.desc}</p>
                  </div>
                </div>

                {isConnected ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 bg-green-500 rounded-full" />
                      <span className="text-xs text-green-600 font-medium">Connected</span>
                      {s.ad_account_id && (
                        <span className="text-xs text-gray-400 ml-auto font-mono truncate max-w-[90px]" title={s.ad_account_id}>
                          {s.ad_account_id.slice(0, 12)}{s.ad_account_id.length > 12 ? '…' : ''}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setConfiguringPlatform(key)}
                        className="flex-1 text-xs border border-gray-200 hover:bg-gray-50 text-gray-600 py-1.5 rounded-lg transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => disconnectPlatform(key)}
                        disabled={disconnecting === key}
                        className="flex-1 text-xs border border-red-200 hover:bg-red-50 text-red-500 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {disconnecting === key ? '…' : 'Disconnect'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfiguringPlatform(key)}
                    className="w-full text-xs text-white py-1.5 rounded-lg transition-opacity hover:opacity-90"
                    style={{ backgroundColor: accent }}
                  >
                    Configure
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Campaigns */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Campaigns</h2>
        {campaigns.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-400 text-sm">No campaigns yet.</p>
            <Link href={`/portal/${slug}/ads/new`} className="text-sm mt-1 block hover:underline" style={{ color: accent }}>
              Create your first campaign →
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {campaigns.map(c => {
              const pm = PLATFORM_META[c.platform as keyof typeof PLATFORM_META]
              return (
                <div key={c.id} className="flex items-center gap-4 px-5 py-4">
                  <span className={`w-8 h-8 ${pm?.color ?? 'bg-gray-400'} rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                    {pm?.icon ?? '?'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.headline}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      ${c.budget_daily}/day
                      {c.location && ` · ${c.location}`}
                      {c.start_date && ` · ${c.start_date}`}
                    </p>
                    {c.error_message && (
                      <p className="text-xs text-red-500 mt-0.5 truncate">{c.error_message}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <span className={statusBadge(c.status)}>{c.status.replace('_', ' ')}</span>
                    {c.impressions > 0 && (
                      <p className="text-xs text-gray-400">{c.impressions.toLocaleString()} impressions</p>
                    )}
                  </div>
                  {(c.status === 'active' || c.status === 'pending') && (
                    <button
                      onClick={() => cancelCampaign(c.id)}
                      className="text-xs text-gray-400 hover:text-red-500 transition-colors shrink-0"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
