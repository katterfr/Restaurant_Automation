'use client'
import { useEffect, useState, useCallback } from 'react'
import { api, BusinessListing, BusinessStatus } from '@/lib/api'

const HOURS_TEMPLATE = {
  monday:    { open: '11:00', close: '22:00', closed: false },
  tuesday:   { open: '11:00', close: '22:00', closed: false },
  wednesday: { open: '11:00', close: '22:00', closed: false },
  thursday:  { open: '11:00', close: '22:00', closed: false },
  friday:    { open: '11:00', close: '23:00', closed: false },
  saturday:  { open: '10:00', close: '23:00', closed: false },
  sunday:    { open: '10:00', close: '21:00', closed: false },
}

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent'

function statusPill(s: string) {
  if (s === 'active' || s === 'submitted') return 'bg-green-100 text-green-700'
  if (s === 'error') return 'bg-red-100 text-red-600'
  if (s === 'pending_manual') return 'bg-amber-100 text-amber-700'
  return 'bg-gray-100 text-gray-500'
}

function statusLabel(s: string) {
  const m: Record<string, string> = {
    active: 'Live', submitted: 'Submitted', error: 'Error',
    not_connected: 'Not connected', not_submitted: 'Not submitted',
    pending_manual: 'Pending review',
  }
  return m[s] ?? s
}

export default function BusinessPage() {
  const [status, setStatus] = useState<BusinessStatus | null>(null)
  const [info, setInfo] = useState<Partial<BusinessListing>>({})
  const [hours, setHours] = useState<Record<string, { open: string; close: string; closed: boolean }>>(HOURS_TEMPLATE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [appleSubmitting, setAppleSubmitting] = useState(false)
  const [actionMsg, setActionMsg] = useState('')
  const [tab, setTab] = useState<'info' | 'google' | 'apple'>('info')

  const load = useCallback(async () => {
    try {
      const [s, i] = await Promise.all([api.business.status(), api.business.info()])
      setStatus(s)
      setInfo(i)
      if (i.hours) {
        try { setHours({ ...HOURS_TEMPLATE, ...JSON.parse(i.hours) }) } catch { /* use default */ }
      }
    } catch { /* feature not enabled shows empty */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function saveInfo(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setSaveMsg('')
    try {
      await api.business.saveInfo({ ...info, hours: JSON.stringify(hours) })
      setSaveMsg('Saved!')
      await load()
    } catch (e: unknown) { setSaveMsg(e instanceof Error ? e.message : 'Save failed') }
    finally { setSaving(false); setTimeout(() => setSaveMsg(''), 3000) }
  }

  async function connectGoogle() {
    setConnecting(true)
    try {
      const { oauth_url } = await api.business.googleConnectUrl()
      window.location.href = oauth_url
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to start Google connection')
      setConnecting(false)
    }
  }

  async function syncGoogle() {
    setSyncing(true); setActionMsg('')
    try {
      await api.business.googleSync()
      setActionMsg('✓ Synced to Google Business Profile!')
      await load()
    } catch (e: unknown) { setActionMsg(e instanceof Error ? e.message : 'Sync failed') }
    finally { setSyncing(false) }
  }

  async function disconnectGoogle() {
    if (!confirm('Disconnect Google Business Profile?')) return
    await api.business.googleDisconnect()
    await load()
  }

  async function submitApple() {
    setAppleSubmitting(true); setActionMsg('')
    try {
      const res = await api.business.appleSubmit()
      setActionMsg(res.message)
      if (res.portal_url && res.status === 'not_configured') {
        setTimeout(() => window.open(res.portal_url, '_blank'), 1500)
      }
      await load()
    } catch (e: unknown) { setActionMsg(e instanceof Error ? e.message : 'Submit failed') }
    finally { setAppleSubmitting(false) }
  }

  function setField(key: keyof BusinessListing, val: string) {
    setInfo(prev => ({ ...prev, [key]: val }))
  }

  function setHourField(day: string, field: 'open' | 'close', val: string) {
    setHours(prev => ({ ...prev, [day]: { ...prev[day], [field]: val } }))
  }

  function toggleClosed(day: string) {
    setHours(prev => ({ ...prev, [day]: { ...prev[day], closed: !prev[day].closed } }))
  }

  if (loading) return <div className="text-sm text-gray-400 py-20 text-center">Loading…</div>

  const googleConnected = status?.google.connected
  const googleStatus = status?.google.google_status ?? 'not_connected'
  const appleStatus = status?.apple.apple_status ?? 'not_submitted'

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Google & Apple Maps Listings</h1>
        <p className="text-sm text-gray-400 mt-0.5">Manage how your restaurant appears on Google Maps and Apple Maps.</p>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-2 gap-4">
        {/* Google */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
          <div className="w-10 h-10 bg-red-500 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0">G</div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900">Google Maps</p>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusPill(googleStatus)}`}>{statusLabel(googleStatus)}</span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {googleConnected ? 'Google Business Profile connected' : 'Connect to manage your Google listing'}
            </p>
          </div>
        </div>
        {/* Apple */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
          <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0"></div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900">Apple Maps</p>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusPill(appleStatus)}`}>{statusLabel(appleStatus)}</span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {appleStatus === 'submitted' ? 'Submitted to Apple Business Connect' : 'Submit your business to Apple Maps'}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {[
          { key: 'info',   label: 'Business Info' },
          { key: 'google', label: 'Google Maps' },
          { key: 'apple',  label: 'Apple Maps' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as 'info' | 'google' | 'apple')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Business Info */}
      {tab === 'info' && (
        <form onSubmit={saveInfo} className="space-y-5">
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Basic Details</h3>
            <p className="text-xs text-gray-400 -mt-2">This information is used for both Google and Apple Maps listings.</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Business Name</label>
                <input value={info.name ?? ''} onChange={e => setField('name', e.target.value)} className={inputCls} placeholder="Joe's Italian Kitchen" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Phone Number</label>
                <input value={info.phone ?? ''} onChange={e => setField('phone', e.target.value)} className={inputCls} placeholder="+1 (555) 123-4567" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Website</label>
                <input type="url" value={info.website ?? ''} onChange={e => setField('website', e.target.value)} className={inputCls} placeholder="https://yourrestaurant.com" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Description</label>
                <textarea value={info.description ?? ''} onChange={e => setField('description', e.target.value)} className={`${inputCls} resize-none`} rows={3} placeholder="Authentic Italian cuisine in the heart of downtown…" maxLength={750} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Address</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Street Address</label>
                <input value={info.address_line1 ?? ''} onChange={e => setField('address_line1', e.target.value)} className={inputCls} placeholder="123 Main Street" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">City</label>
                <input value={info.city ?? ''} onChange={e => setField('city', e.target.value)} className={inputCls} placeholder="Chicago" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">State</label>
                  <select value={info.state ?? ''} onChange={e => setField('state', e.target.value)} className={inputCls}>
                    <option value="">—</option>
                    {US_STATES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">ZIP</label>
                  <input value={info.zip ?? ''} onChange={e => setField('zip', e.target.value)} className={inputCls} placeholder="60601" maxLength={10} />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Hours of Operation</h3>
            <div className="space-y-2">
              {DAYS.map(day => (
                <div key={day} className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 capitalize w-20 shrink-0">{day}</span>
                  <button
                    type="button"
                    onClick={() => toggleClosed(day)}
                    className={`w-8 h-4 rounded-full transition-colors relative shrink-0 ${hours[day]?.closed ? 'bg-gray-300' : 'bg-green-500'}`}
                  >
                    <span className={`block w-3 h-3 rounded-full bg-white shadow absolute top-0.5 transition-transform ${hours[day]?.closed ? 'translate-x-0.5' : 'translate-x-4'}`} />
                  </button>
                  {hours[day]?.closed ? (
                    <span className="text-xs text-gray-400 italic">Closed</span>
                  ) : (
                    <div className="flex items-center gap-2 flex-1">
                      <input type="time" value={hours[day]?.open ?? '11:00'} onChange={e => setHourField(day, 'open', e.target.value)} className="border border-gray-200 rounded px-2 py-1 text-xs w-24" />
                      <span className="text-xs text-gray-400">to</span>
                      <input type="time" value={hours[day]?.close ?? '22:00'} onChange={e => setHourField(day, 'close', e.target.value)} className="border border-gray-200 rounded px-2 py-1 text-xs w-24" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button type="submit" disabled={saving} className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">
              {saving ? 'Saving…' : 'Save Business Info'}
            </button>
            {saveMsg && <p className={`text-sm ${saveMsg.startsWith('✓') || saveMsg === 'Saved!' ? 'text-green-600' : 'text-red-500'}`}>{saveMsg}</p>}
          </div>
        </form>
      )}

      {/* Tab: Google Maps */}
      {tab === 'google' && (
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-red-500 rounded-xl flex items-center justify-center text-white font-bold text-xl shrink-0">G</div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-gray-900">Google Business Profile</h3>
                <p className="text-xs text-gray-400 mt-0.5 mb-4">
                  Connects your restaurant to Google Maps, Google Search, and Google reviews. Customers can find your hours, phone, directions, and leave reviews.
                </p>
                {googleConnected ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-500 rounded-full" />
                      <span className="text-xs text-green-700 font-medium">Google account connected</span>
                    </div>
                    {status?.google.location_id ? (
                      <p className="text-xs text-gray-500">Location: <span className="font-mono text-gray-700">{status.google.location_id}</span></p>
                    ) : (
                      <p className="text-xs text-amber-600">No location synced yet. Click Sync below to create your Google listing.</p>
                    )}
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={syncGoogle}
                        disabled={syncing}
                        className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        {syncing ? 'Syncing…' : status?.google.location_id ? 'Sync Changes' : 'Create Google Listing'}
                      </button>
                      <button
                        onClick={disconnectGoogle}
                        className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        Disconnect
                      </button>
                    </div>
                  </div>
                ) : status?.google.configured ? (
                  <div className="space-y-3">
                    <p className="text-xs text-gray-500">Connect your Google account to create and manage your Google Maps listing.</p>
                    <button
                      onClick={connectGoogle}
                      disabled={connecting}
                      className="flex items-center gap-2 bg-white border-2 border-gray-200 hover:border-red-400 hover:bg-red-50 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                    >
                      <span className="w-5 h-5 bg-red-500 rounded flex items-center justify-center text-white text-xs font-bold">G</span>
                      {connecting ? 'Redirecting to Google…' : 'Sign in with Google'}
                    </button>
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-700">
                    Google API credentials not configured. Add <code className="font-mono bg-amber-100 px-1 rounded">GOOGLE_CLIENT_ID</code> and <code className="font-mono bg-amber-100 px-1 rounded">GOOGLE_CLIENT_SECRET</code> in Railway environment variables.
                  </div>
                )}
              </div>
            </div>
          </div>

          {actionMsg && (
            <div className={`text-sm px-4 py-3 rounded-lg border ${actionMsg.startsWith('✓') ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-600'}`}>
              {actionMsg}
            </div>
          )}

          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-700 space-y-1">
            <p className="font-semibold">What gets synced to Google Maps:</p>
            <ul className="list-disc ml-4 space-y-0.5">
              <li>Business name, phone number, and website</li>
              <li>Full address for Google Maps pin</li>
              <li>Hours of operation (from Business Info tab)</li>
              <li>Business description</li>
              <li>Restaurant category</li>
            </ul>
          </div>
        </div>
      )}

      {/* Tab: Apple Maps */}
      {tab === 'apple' && (
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-gray-900 rounded-xl flex items-center justify-center text-white font-bold text-2xl shrink-0"></div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-gray-900">Apple Business Connect</h3>
                <p className="text-xs text-gray-400 mt-0.5 mb-4">
                  Manage your restaurant&apos;s presence on Apple Maps, Siri, and other Apple services. Over 1 billion Apple devices use Apple Maps.
                </p>

                {appleStatus === 'submitted' ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-500 rounded-full" />
                      <span className="text-xs text-green-700 font-medium">Submitted to Apple Maps</span>
                    </div>
                    <p className="text-xs text-gray-500">Apple reviews submissions within a few business days. You can update your listing anytime.</p>
                    <button
                      onClick={submitApple}
                      disabled={appleSubmitting}
                      className="bg-gray-900 hover:bg-gray-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      {appleSubmitting ? 'Updating…' : 'Resubmit Changes'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-xs text-gray-500">
                      {status?.apple.configured
                        ? 'Submit your business information to Apple Maps. Apple will review and publish your listing.'
                        : 'Apple Maps API is not configured on this platform. You can still submit your listing directly through Apple Business Connect.'}
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={submitApple}
                        disabled={appleSubmitting}
                        className="bg-gray-900 hover:bg-gray-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
                      >
                        <span></span>
                        {appleSubmitting ? 'Submitting…' : 'Submit to Apple Maps'}
                      </button>
                      <a
                        href="https://businessconnect.apple.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
                      >
                        Open Apple Business Connect ↗
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {actionMsg && (
            <div className={`text-sm px-4 py-3 rounded-lg border ${actionMsg.startsWith('✓') || actionMsg.includes('submitted') ? 'bg-green-50 border-green-200 text-green-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
              {actionMsg}
            </div>
          )}

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-600 space-y-1">
            <p className="font-semibold text-gray-700">What appears on Apple Maps:</p>
            <ul className="list-disc ml-4 space-y-0.5">
              <li>Business name, phone, and website</li>
              <li>Address pin on Apple Maps</li>
              <li>Hours of operation</li>
              <li>Directions via Apple Maps, Siri, and CarPlay</li>
              <li>Business category and photos</li>
            </ul>
            <p className="mt-2 text-gray-400">Apple reviews all submissions. Changes may take 3–5 business days to appear.</p>
          </div>
        </div>
      )}
    </div>
  )
}
