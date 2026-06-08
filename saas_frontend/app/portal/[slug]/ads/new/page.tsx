'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { api, PlatformStatus } from '@/lib/api'

const PLATFORMS = [
  { key: 'meta',   label: 'Meta',   icon: 'f', color: 'bg-blue-600',  sub: 'Facebook + Instagram' },
  { key: 'google', label: 'Google', icon: 'G', color: 'bg-red-500',   sub: 'Search + Display' },
  { key: 'tiktok', label: 'TikTok', icon: '♪', color: 'bg-black',     sub: 'In-Feed Video/Image' },
]

const CTA_OPTIONS = [
  { value: 'LEARN_MORE',    label: 'Learn More' },
  { value: 'ORDER_NOW',     label: 'Order Now' },
  { value: 'CALL_NOW',      label: 'Call Now' },
  { value: 'GET_DIRECTIONS',label: 'Get Directions' },
  { value: 'SHOP_NOW',      label: 'Shop Now' },
]

export default function NewCampaignPage() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug ?? ''
  const router = useRouter()

  const [platformStatus, setPlatformStatus] = useState<Record<string, PlatformStatus>>({})
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([])
  const [form, setForm] = useState({
    headline: '',
    body: '',
    image_url: '',
    destination_url: '',
    cta: 'LEARN_MORE',
    budget_daily: '15',
    location: '',
    radius_miles: '10',
    start_date: '',
    end_date: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [results, setResults] = useState<Array<{ platform: string; status: string; error?: string }> | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.ads.status().then(setPlatformStatus).catch(() => {})
  }, [])

  function togglePlatform(key: string) {
    setSelectedPlatforms(prev =>
      prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]
    )
  }

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (selectedPlatforms.length === 0) {
      setError('Select at least one platform')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await api.ads.create({
        platforms: selectedPlatforms,
        headline: form.headline,
        body: form.body,
        image_url: form.image_url || undefined,
        destination_url: form.destination_url || undefined,
        cta: form.cta,
        budget_daily: parseFloat(form.budget_daily) || 10,
        location: form.location || undefined,
        radius_miles: parseInt(form.radius_miles) || 10,
        start_date: form.start_date || undefined,
        end_date: form.end_date || undefined,
      })
      setResults(res)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create campaign')
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1.5'

  if (results) {
    const allOk = results.every(r => r.status === 'active' || r.status === 'pending')
    return (
      <div className="max-w-lg space-y-6">
        <div>
          <Link href={`/portal/${slug}/ads`} className="text-sm text-gray-400 hover:text-gray-600">← Ads</Link>
          <h1 className="text-xl font-bold text-gray-900 mt-1">Campaign Results</h1>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {results.map(r => (
            <div key={r.platform} className="flex items-center gap-3 px-5 py-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900 capitalize">{r.platform}</p>
                {r.error && <p className="text-xs text-red-500 mt-0.5">{r.error}</p>}
                {r.status === 'not_configured' && (
                  <p className="text-xs text-gray-400 mt-0.5">Add API credentials in Railway to activate</p>
                )}
                {r.status === 'not_connected' && (
                  <p className="text-xs text-amber-600 mt-0.5">Connect your {r.platform} account on the Ads page first</p>
                )}
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                r.status === 'active'          ? 'bg-green-100 text-green-700' :
                r.status === 'not_configured'  ? 'bg-gray-100 text-gray-500' :
                r.status === 'not_connected'   ? 'bg-yellow-100 text-yellow-700' :
                r.status === 'failed'          ? 'bg-red-100 text-red-600' :
                'bg-amber-100 text-amber-700'
              }`}>
                {r.status.replace('_', ' ')}
              </span>
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => router.push(`/portal/${slug}/ads`)}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            View All Campaigns
          </button>
          {!allOk && (
            <button
              onClick={() => setResults(null)}
              className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Try Again
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <Link href={`/portal/${slug}/ads`} className="text-sm text-gray-400 hover:text-gray-600">← Ads</Link>
        <h1 className="text-xl font-bold text-gray-900 mt-1">Create Campaign</h1>
        <p className="text-sm text-gray-400 mt-0.5">Deploy ads to multiple platforms at once.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Platform selection */}
        <div>
          <p className={labelCls}>Platforms</p>
          <div className="grid grid-cols-3 gap-3">
            {PLATFORMS.map(p => {
              const s = platformStatus[p.key]
              const isSelected = selectedPlatforms.includes(p.key)
              const isConnected = s?.connected
              const isConfigured = s?.configured

              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => togglePlatform(p.key)}
                  className={`relative border-2 rounded-xl p-3 text-left transition-all ${
                    isSelected ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <span className={`w-8 h-8 ${p.color} rounded-lg flex items-center justify-center text-white font-bold text-sm mb-2`}>
                    {p.icon}
                  </span>
                  <p className="text-xs font-semibold text-gray-900">{p.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {!isConfigured ? 'Not configured' : !isConnected ? 'Not connected' : 'Ready'}
                  </p>
                  {isSelected && (
                    <span className="absolute top-2 right-2 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center text-white text-xs">✓</span>
                  )}
                </button>
              )
            })}
          </div>
          {selectedPlatforms.some(p => !platformStatus[p]?.connected) && selectedPlatforms.length > 0 && (
            <p className="text-xs text-amber-600 mt-2">
              Unconnected platforms will be saved as pending. Connect them on the Ads page to activate.
            </p>
          )}
        </div>

        {/* Creative */}
        <div className="space-y-4">
          <p className="text-sm font-semibold text-gray-900 border-b border-gray-100 pb-2">Ad Creative</p>
          <div>
            <label className={labelCls}>Headline <span className="text-gray-400 font-normal">(max 30 chars for Google)</span></label>
            <input type="text" required value={form.headline} onChange={e => set('headline', e.target.value)} className={inputCls} placeholder="Weekend Special — 20% Off!" maxLength={255} />
          </div>
          <div>
            <label className={labelCls}>Body text</label>
            <textarea required value={form.body} onChange={e => set('body', e.target.value)} className={`${inputCls} resize-none`} rows={3} placeholder="Order your favourite dishes online or visit us today. Fresh ingredients, great taste." maxLength={500} />
          </div>
          <div>
            <label className={labelCls}>Image URL <span className="text-gray-400 font-normal">(optional but recommended)</span></label>
            <input type="url" value={form.image_url} onChange={e => set('image_url', e.target.value)} className={inputCls} placeholder="https://yoursite.com/promo.jpg" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Destination URL</label>
              <input type="url" value={form.destination_url} onChange={e => set('destination_url', e.target.value)} className={inputCls} placeholder="https://yoursite.com" />
            </div>
            <div>
              <label className={labelCls}>Call to Action</label>
              <select value={form.cta} onChange={e => set('cta', e.target.value)} className={inputCls}>
                {CTA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Budget & Schedule */}
        <div className="space-y-4">
          <p className="text-sm font-semibold text-gray-900 border-b border-gray-100 pb-2">Budget & Schedule</p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Daily Budget ($)</label>
              <input type="number" min="1" step="1" value={form.budget_daily} onChange={e => set('budget_daily', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Start Date</label>
              <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>End Date</label>
              <input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} className={inputCls} />
            </div>
          </div>
        </div>

        {/* Targeting */}
        <div className="space-y-4">
          <p className="text-sm font-semibold text-gray-900 border-b border-gray-100 pb-2">Targeting</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Location <span className="text-gray-400 font-normal">(city, address, or zip)</span></label>
              <input type="text" value={form.location} onChange={e => set('location', e.target.value)} className={inputCls} placeholder="Chicago, IL" />
            </div>
            <div>
              <label className={labelCls}>Radius</label>
              <select value={form.radius_miles} onChange={e => set('radius_miles', e.target.value)} className={inputCls}>
                {[5, 10, 15, 25, 50].map(r => (
                  <option key={r} value={r}>{r} miles</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            {submitting ? 'Deploying…' : 'Deploy Campaign'}
          </button>
          <Link
            href={`/portal/${slug}/ads`}
            className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
