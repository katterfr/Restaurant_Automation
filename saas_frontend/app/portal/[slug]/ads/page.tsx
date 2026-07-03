'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { api, AdCampaign, PlatformStatus } from '@/lib/api'

const PLATFORM_META = {
  google:    { label: 'Google',    icon: 'G',  color: 'bg-red-500',     desc: 'Search, Display & YouTube', loginLabel: 'Continue with Google' },
  snapchat:  { label: 'Snapchat',  icon: 'S',  color: 'bg-yellow-400',  desc: 'Story & Snap Ads',           loginLabel: 'Continue with Snapchat' },
  pinterest: { label: 'Pinterest', icon: 'P',  color: 'bg-red-600',     desc: 'Promoted Pins',              loginLabel: 'Continue with Pinterest' },
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

export default function AdsPage() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug ?? ''
  const searchParams = useSearchParams()
  const justConnected = searchParams.get('connected')

  const [status, setStatus]         = useState<Record<string, PlatformStatus>>({})
  const [campaigns, setCampaigns]   = useState<AdCampaign[]>([])
  const [loading, setLoading]       = useState(true)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [toast, setToast]           = useState('')
  const [toastError, setToastError] = useState(false)
  const [accent, setAccent]         = useState('#16a34a')

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([api.ads.status(), api.ads.campaigns()])
      setStatus(s)
      setCampaigns(c)
    } catch { /* handled by layout */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    api.portal.customization().then(c => { if (c.accent_color) setAccent(c.accent_color) }).catch(() => {})
  }, [])

  useEffect(() => {
    if (justConnected) {
      const name = PLATFORM_META[justConnected as keyof typeof PLATFORM_META]?.label ?? justConnected
      showToast(`${name} connected successfully!`, false)
    }
  }, [justConnected])

  function showToast(msg: string, error = false) {
    setToast(msg); setToastError(error)
    setTimeout(() => setToast(''), 4000)
  }

  async function connectPlatform(platform: string) {
    setConnecting(platform)
    try {
      const { oauth_url } = await api.ads.connectUrl(platform)
      window.location.href = oauth_url
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Connection failed'
      showToast(msg, true)
      setConnecting(null)
    }
  }

  async function disconnectPlatform(platform: string) {
    if (!confirm(`Disconnect ${PLATFORM_META[platform as keyof typeof PLATFORM_META]?.label ?? platform}?`)) return
    setDisconnecting(platform)
    try {
      await api.ads.disconnect(platform)
      await load()
      showToast(`${PLATFORM_META[platform as keyof typeof PLATFORM_META]?.label} disconnected`)
    } catch { /* ignore */ }
    finally { setDisconnecting(null) }
  }

  async function cancelCampaign(id: number) {
    if (!confirm('Cancel this campaign?')) return
    await api.ads.cancel(id)
    await load()
  }

  if (loading) return <div className="text-sm text-gray-400 py-20 text-center">Loading…</div>

  const totalSpend      = campaigns.reduce((s, c) => s + (c.spend ?? 0), 0)
  const activeCampaigns = campaigns.filter(c => c.status === 'active').length

  return (
    <div className="space-y-8">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 px-4 py-3 rounded-xl shadow-lg text-sm z-50 flex items-center gap-2 text-white ${toastError ? 'bg-red-600' : 'bg-green-600'}`}>
          <span>{toastError ? '✕' : '✓'}</span> {toast}
        </div>
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
            const s          = status[key]
            const isConnected = s?.connected
            const isBusy     = connecting === key || disconnecting === key

            return (
              <div
                key={key}
                className={`bg-white rounded-xl border-2 p-4 transition-colors ${isConnected ? 'border-green-200' : 'border-gray-200'}`}
              >
                {/* Platform header */}
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
                  /* ── Connected state ── */
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 bg-green-500 rounded-full" />
                      <span className="text-xs text-green-600 font-medium">Connected</span>
                      {s.ad_account_id && (
                        <span className="text-xs text-gray-400 ml-auto font-mono truncate max-w-[90px]" title={s.ad_account_id}>
                          {s.ad_account_id.length > 14 ? `${s.ad_account_id.slice(0, 14)}…` : s.ad_account_id}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => connectPlatform(key)}
                        disabled={isBusy}
                        className="flex-1 text-xs border border-gray-200 hover:bg-gray-50 text-gray-600 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {connecting === key ? 'Redirecting…' : 'Reconnect'}
                      </button>
                      <button
                        onClick={() => disconnectPlatform(key)}
                        disabled={isBusy}
                        className="flex-1 text-xs border border-red-200 hover:bg-red-50 text-red-500 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {disconnecting === key ? '…' : 'Disconnect'}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── Not connected state ── */
                  <button
                    onClick={() => connectPlatform(key)}
                    disabled={isBusy}
                    className="w-full flex items-center justify-center gap-2 text-xs font-semibold text-white py-2 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-60"
                    style={{ backgroundColor: accent }}
                  >
                    {connecting === key ? (
                      <>
                        <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Redirecting…
                      </>
                    ) : (
                      meta.loginLabel
                    )}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Campaigns list */}
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
