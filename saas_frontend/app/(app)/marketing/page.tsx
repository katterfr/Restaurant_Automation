'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { api, SocialPost, AdCampaign, CreativeAsset } from '@/lib/api'

// ── helpers ────────────────────────────────────────────────────────────────────
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const SOCIAL_PLATFORMS = [
  { id: 'meta',          label: 'Facebook & Instagram', icon: 'f', color: 'bg-blue-600' },
  { id: 'tiktok_content',label: 'TikTok',              icon: '♪', color: 'bg-black' },
  { id: 'youtube',       label: 'YouTube',              icon: '▶', color: 'bg-red-600' },
]

const AD_PLATFORMS = [
  { id: 'meta',      label: 'Meta',      icon: 'f', color: 'bg-blue-600' },
  { id: 'google',    label: 'Google',    icon: 'G', color: 'bg-red-500' },
  { id: 'tiktok',    label: 'TikTok',    icon: '♪', color: 'bg-black' },
  { id: 'snapchat',  label: 'Snapchat',  icon: 'S', color: 'bg-yellow-400' },
  { id: 'pinterest', label: 'Pinterest', icon: 'P', color: 'bg-red-600' },
]

const IMG_TEMPLATES = [
  'CarefulServer brand awareness',
  'Restaurant success story',
  'Platform demo screenshot',
  'Happy restaurant owner',
  'Team collaboration',
  'Technology & dining',
]

const STYLES = ['Photorealistic', 'Vibrant', 'Minimal', 'Dark & Bold', 'Social Media']

type Tab = 'social' | 'ads' | 'creative'

// ── Connection card component ──────────────────────────────────────────────────
function ConnectCard({ id, label, icon, color, connected, connecting, onConnect, onDisconnect }: {
  id: string; label: string; icon: string; color: string
  connected: boolean; connecting: boolean
  onConnect: () => void; onDisconnect: () => void
}) {
  return (
    <div className="border border-gray-700 rounded-xl p-4 flex items-center justify-between bg-gray-900">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center text-white text-sm font-bold shrink-0`}>
          {icon}
        </div>
        <div>
          <p className="text-sm font-medium text-white">{label}</p>
          {connected
            ? <p className="text-xs text-emerald-400">Connected</p>
            : <p className="text-xs text-gray-500">Not connected</p>}
        </div>
      </div>
      {connected ? (
        <button onClick={onDisconnect} disabled={connecting} className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-red-600/30 hover:text-red-400 text-gray-300 rounded-lg border border-gray-600 hover:border-red-500/40 transition-all disabled:opacity-40">
          Disconnect
        </button>
      ) : (
        <button onClick={onConnect} disabled={connecting} className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-40">
          {connecting ? 'Connecting…' : 'Connect'}
        </button>
      )}
    </div>
  )
}

// ── Social tab ─────────────────────────────────────────────────────────────────
function SocialTab({ socialStatus, onRefreshStatus }: { socialStatus: Record<string, { connected: boolean }>; onRefreshStatus: () => void }) {
  const [posts, setPosts]         = useState<SocialPost[]>([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [showForm, setShowForm]   = useState(false)

  const [selPlatforms, setSelPlatforms] = useState<string[]>([])
  const [content, setContent]     = useState('')
  const [imageUrl, setImageUrl]   = useState('')
  const [linkUrl, setLinkUrl]     = useState('')

  useEffect(() => {
    api.adminMarketing.social.posts().then(setPosts).catch(console.error).finally(() => setLoading(false))
  }, [])

  async function connect(platform: string) {
    setConnecting(platform)
    try {
      const { oauth_url } = await api.adminMarketing.connectUrl(platform, 'social')
      window.location.href = oauth_url
    } catch (e) { setError((e as Error).message); setConnecting(null) }
  }

  async function disconnect(platform: string) {
    setConnecting(platform)
    try { await api.adminMarketing.disconnect(platform); onRefreshStatus() }
    catch (e) { setError((e as Error).message) }
    finally { setConnecting(null) }
  }

  function togglePlatform(id: string) {
    setSelPlatforms(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])
  }

  async function publish() {
    if (!selPlatforms.length || !content) return
    setSaving(true)
    try {
      const res = await api.adminMarketing.social.create({
        platforms: selPlatforms, content,
        image_url: imageUrl || undefined,
        link_url: linkUrl || undefined,
      })
      setPosts(prev => [{ id: res.id, tenant_id: 0, platforms: JSON.stringify(selPlatforms), content, image_url: imageUrl || null, link_url: linkUrl || null, status: res.status, platform_results: JSON.stringify(res.results), error_message: null, created_at: new Date().toISOString() }, ...prev])
      setContent(''); setImageUrl(''); setLinkUrl(''); setSelPlatforms([]); setShowForm(false)
    } catch (e) { setError((e as Error).message) }
    finally { setSaving(false) }
  }

  async function deletePost(id: number) {
    if (!confirm('Delete this post?')) return
    try { await api.adminMarketing.social.delete(id); setPosts(prev => prev.filter(p => p.id !== id)) }
    catch (e) { setError((e as Error).message) }
  }

  return (
    <div className="space-y-6">
      {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm">{error} <button onClick={() => setError(null)}>✕</button></div>}

      {/* Connected Accounts */}
      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Connected Accounts</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {SOCIAL_PLATFORMS.map(p => (
            <ConnectCard key={p.id} {...p}
              connected={Boolean(socialStatus[p.id]?.connected)}
              connecting={connecting === p.id}
              onConnect={() => connect(p.id)}
              onDisconnect={() => disconnect(p.id)}
            />
          ))}
        </div>
      </div>

      {/* Create post */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Post History</h3>
          <button onClick={() => setShowForm(v => !v)} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors">
            {showForm ? 'Cancel' : '+ Create Post'}
          </button>
        </div>

        {showForm && (
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4 mb-4">
            <div>
              <label className="text-xs text-gray-400 font-medium">Platforms</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {SOCIAL_PLATFORMS.map(p => (
                  <button key={p.id} onClick={() => togglePlatform(p.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${selPlatforms.includes(p.id) ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-600 text-gray-300 hover:text-white'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 font-medium">Caption</label>
              <textarea value={content} onChange={e => setContent(e.target.value)} rows={4} placeholder="Write your post content for CarefulServer..." className="mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 font-medium">Image URL (optional)</label>
                <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." className="mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-xs text-gray-400 font-medium">Link URL (optional)</label>
                <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://carefulserver.com/..." className="mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
              </div>
            </div>
            <button onClick={publish} disabled={saving || !selPlatforms.length || !content} className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors">
              {saving ? 'Publishing…' : 'Publish Now'}
            </button>
          </div>
        )}

        {loading ? <div className="text-sm text-gray-500 py-4">Loading posts…</div>
        : posts.length === 0 ? <div className="text-sm text-gray-500 py-8 text-center border border-gray-800 rounded-xl">No posts yet.</div>
        : (
          <div className="space-y-2">
            {posts.map(p => {
              const results: Record<string, { status: string }> = JSON.parse(p.platform_results || '{}')
              const plats: string[] = JSON.parse(p.platforms || '[]')
              return (
                <div key={p.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {plats.map(pid => <span key={pid} className="text-[11px] bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">{pid.replace('_content','')}</span>)}
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                        p.status === 'published' ? 'bg-emerald-500/20 text-emerald-400' :
                        p.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      }`}>{p.status}</span>
                    </div>
                    <p className="text-sm text-gray-200 line-clamp-2">{p.content}</p>
                    <p className="text-xs text-gray-500 mt-1">{fmtDate(p.created_at)}</p>
                    {Object.entries(results).map(([pid, r]) => r.status === 'failed' && (
                      <p key={pid} className="text-xs text-red-400 mt-0.5">{pid}: {String((r as Record<string, unknown>).error ?? 'failed')}</p>
                    ))}
                  </div>
                  <button onClick={() => deletePost(p.id)} className="text-gray-600 hover:text-red-400 text-xs shrink-0 mt-1 transition-colors">✕</button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Ads tab ────────────────────────────────────────────────────────────────────
function AdsTab({ adsStatus, onRefreshStatus }: { adsStatus: Record<string, { configured: boolean; connected: boolean }>; onRefreshStatus: () => void }) {
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [showForm, setShowForm]   = useState(false)

  const [selPlatforms, setSelPlatforms] = useState<string[]>([])
  const [headline, setHeadline]   = useState('')
  const [body, setBody]           = useState('')
  const [imageUrl, setImageUrl]   = useState('')
  const [destUrl, setDestUrl]     = useState('https://carefulserver.com')
  const [budget, setBudget]       = useState('10')

  useEffect(() => {
    api.adminMarketing.ads.campaigns().then(setCampaigns).catch(console.error).finally(() => setLoading(false))
  }, [])

  async function connect(platform: string) {
    setConnecting(platform)
    try {
      const { oauth_url } = await api.adminMarketing.connectUrl(platform, 'ads')
      window.location.href = oauth_url
    } catch (e) { setError((e as Error).message); setConnecting(null) }
  }

  async function disconnect(platform: string) {
    setConnecting(platform)
    try { await api.adminMarketing.disconnect(platform); onRefreshStatus() }
    catch (e) { setError((e as Error).message) }
    finally { setConnecting(null) }
  }

  function togglePlatform(id: string) {
    setSelPlatforms(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])
  }

  async function launch() {
    if (!selPlatforms.length || !headline || !body) return
    setSaving(true)
    try {
      const res = await api.adminMarketing.ads.create({
        platforms: selPlatforms, headline, body,
        image_url: imageUrl || undefined,
        destination_url: destUrl || undefined,
        budget_daily: parseFloat(budget) || 10,
      }) as AdCampaign[]
      setCampaigns(prev => [...res, ...prev])
      setHeadline(''); setBody(''); setImageUrl(''); setSelPlatforms([]); setShowForm(false)
    } catch (e) { setError((e as Error).message) }
    finally { setSaving(false) }
  }

  async function cancel(id: number) {
    if (!confirm('Cancel this campaign?')) return
    try {
      await api.adminMarketing.ads.cancel(id)
      setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: 'cancelled' } : c))
    } catch (e) { setError((e as Error).message) }
  }

  return (
    <div className="space-y-6">
      {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm">{error} <button onClick={() => setError(null)}>✕</button></div>}

      {/* Platform connections */}
      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Platform Connections</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {AD_PLATFORMS.map(p => (
            <ConnectCard key={p.id} {...p}
              connected={Boolean(adsStatus[p.id]?.connected)}
              connecting={connecting === p.id}
              onConnect={() => connect(p.id)}
              onDisconnect={() => disconnect(p.id)}
            />
          ))}
        </div>
      </div>

      {/* Campaign creator */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Campaigns</h3>
          <button onClick={() => setShowForm(v => !v)} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition-colors">
            {showForm ? 'Cancel' : '+ Create Campaign'}
          </button>
        </div>

        {showForm && (
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4 mb-4">
            <div>
              <label className="text-xs text-gray-400 font-medium">Platforms</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {AD_PLATFORMS.map(p => (
                  <button key={p.id} onClick={() => togglePlatform(p.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${selPlatforms.includes(p.id) ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-800 border-gray-600 text-gray-300 hover:text-white'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-gray-400 font-medium">Headline</label>
                <input value={headline} onChange={e => setHeadline(e.target.value)} placeholder="Grow your restaurant with AI" className="mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-400 font-medium">Ad Copy</label>
                <textarea value={body} onChange={e => setBody(e.target.value)} rows={3} placeholder="CarefulServer helps restaurant owners..." className="mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none" />
              </div>
              <div>
                <label className="text-xs text-gray-400 font-medium">Image URL (optional)</label>
                <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." className="mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500" />
              </div>
              <div>
                <label className="text-xs text-gray-400 font-medium">Daily Budget ($)</label>
                <input type="number" min="1" value={budget} onChange={e => setBudget(e.target.value)} className="mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-400 font-medium">Destination URL</label>
                <input value={destUrl} onChange={e => setDestUrl(e.target.value)} className="mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />
              </div>
            </div>
            <button onClick={launch} disabled={saving || !selPlatforms.length || !headline || !body} className="w-full py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors">
              {saving ? 'Launching…' : 'Launch Campaign'}
            </button>
          </div>
        )}

        {loading ? <div className="text-sm text-gray-500 py-4">Loading campaigns…</div>
        : campaigns.length === 0 ? <div className="text-sm text-gray-500 py-8 text-center border border-gray-800 rounded-xl">No campaigns yet.</div>
        : (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-800">
                <tr>{['Platform', 'Headline', 'Budget/day', 'Status', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-xs text-gray-400 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {campaigns.map(c => (
                  <tr key={c.id} className="hover:bg-gray-800/40">
                    <td className="px-4 py-2.5 text-gray-300 text-xs capitalize">{c.platform}</td>
                    <td className="px-4 py-2.5 text-gray-200 text-xs max-w-xs truncate">{c.headline}</td>
                    <td className="px-4 py-2.5 text-gray-300 text-xs">${c.budget_daily}/day</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                        c.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
                        c.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                        c.status === 'cancelled' ? 'bg-gray-600/30 text-gray-500' :
                        'bg-yellow-500/20 text-yellow-400'
                      }`}>{c.status}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      {c.status === 'active' && (
                        <button onClick={() => cancel(c.id)} className="text-gray-500 hover:text-red-400 text-xs transition-colors">Cancel</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Creative tab ───────────────────────────────────────────────────────────────
function CreativeTab() {
  const [assets, setAssets]       = useState<CreativeAsset[]>([])
  const [loading, setLoading]     = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [usage, setUsage]         = useState({ images: { used: 0, limit: 999 }, videos: { used: 0, limit: 999 } })
  const [mode, setMode]           = useState<'image' | 'video'>('image')
  const [prompt, setPrompt]       = useState('')
  const [style, setStyle]         = useState('Photorealistic')
  const [aspect, setAspect]       = useState('1:1')

  const loadLibrary = useCallback(async () => {
    try {
      const data = await api.adminMarketing.creative.library()
      setAssets(data.assets)
      setUsage(data.usage)
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadLibrary() }, [loadLibrary])

  async function generate() {
    if (!prompt.trim()) return
    setGenerating(true)
    setError(null)
    try {
      if (mode === 'image') {
        const res = await api.adminMarketing.creative.generateImage({
          prompt: prompt.trim(), style: style.toLowerCase(), aspect_ratio: aspect,
        })
        setAssets(prev => [{ id: res.id, tenant_id: 0, type: 'image', status: res.status as CreativeAsset['status'], prompt, style: style.toLowerCase(), aspect_ratio: aspect, url: res.url || null, thumbnail_url: null, error_message: null, created_at: new Date().toISOString() }, ...prev])
      } else {
        await api.adminMarketing.creative.generateVideo({ prompt: prompt.trim(), aspect_ratio: aspect, style: style.toLowerCase() })
        await loadLibrary()
      }
      setPrompt('')
    } catch (e) { setError((e as Error).message) }
    finally { setGenerating(false) }
  }

  async function deleteAsset(id: number) {
    try { await api.adminMarketing.creative.delete(id); setAssets(prev => prev.filter(a => a.id !== id)) }
    catch (e) { setError((e as Error).message) }
  }

  const aspectRatios = mode === 'image' ? ['1:1', '4:3', '16:9', '9:16'] : ['16:9', '9:16', '1:1']

  return (
    <div className="flex gap-6">
      {/* Left — generator */}
      <div className="w-72 shrink-0 space-y-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-1">
          <p className="text-xs text-gray-400 font-medium">MONTHLY USAGE · ADMIN</p>
          <div className="space-y-2">
            {(['images', 'videos'] as const).map(k => (
              <div key={k}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="capitalize text-gray-300">{k}</span>
                  <span className="text-gray-400">{usage[k].used} / ∞</span>
                </div>
                <div className="h-1.5 bg-gray-700 rounded-full"><div className="h-1.5 bg-blue-500 rounded-full w-0" /></div>
              </div>
            ))}
          </div>
        </div>

        {/* Mode toggle */}
        <div className="flex bg-gray-800 rounded-lg p-1">
          {(['image', 'video'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${mode === m ? 'bg-white text-gray-900' : 'text-gray-400 hover:text-white'}`}>{m}</button>
          ))}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
          <h3 className="text-sm font-semibold text-white">Generate {mode === 'image' ? 'Image' : 'Video'}</h3>

          <div>
            <label className="text-xs text-gray-400">Quick templates</label>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {IMG_TEMPLATES.map(t => (
                <button key={t} onClick={() => setPrompt(t)} className="text-[11px] border border-gray-600 text-gray-300 hover:text-white hover:border-gray-400 rounded-lg px-2 py-1 transition-colors">{t}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400">Describe your creative</label>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={4} placeholder="e.g. Restaurant owner smiling at tablet with CarefulServer dashboard..." className="mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none" />
          </div>

          <div>
            <label className="text-xs text-gray-400">Style</label>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {STYLES.map(s => (
                <button key={s} onClick={() => setStyle(s)} className={`text-[11px] px-2 py-1 rounded-lg border transition-colors ${style === s ? 'border-blue-500 bg-blue-600/20 text-blue-300' : 'border-gray-600 text-gray-400 hover:text-white'}`}>{s}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400">Aspect ratio</label>
            <div className="flex gap-1.5 mt-2">
              {aspectRatios.map(a => (
                <button key={a} onClick={() => setAspect(a)} className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${aspect === a ? 'border-blue-500 bg-blue-600/20 text-blue-300' : 'border-gray-600 text-gray-400 hover:text-white'}`}>{a}</button>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button onClick={generate} disabled={generating || !prompt.trim()} className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg text-sm font-semibold transition-colors">
            {generating ? 'Generating…' : `Generate ${mode === 'image' ? 'Image' : 'Video'}`}
          </button>
        </div>
      </div>

      {/* Right — library */}
      <div className="flex-1">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Creative Library</h3>
          <div className="flex gap-2">
            {(['All', 'Image', 'Video'] as const).map(f => (
              <button key={f} className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 hover:text-white transition-colors">{f}</button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-gray-500">Loading library…</div>
        ) : assets.length === 0 ? (
          <div className="border border-gray-800 rounded-xl p-12 text-center text-sm text-gray-500">No assets yet — generate your first image or video.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {assets.map(a => (
              <div key={a.id} className="border border-gray-700 rounded-xl overflow-hidden bg-gray-900 group">
                <div className="relative aspect-square bg-gray-800 flex items-center justify-center">
                  {a.status === 'completed' && a.url ? (
                    <img src={a.url} alt={a.prompt} className="w-full h-full object-cover" />
                  ) : a.status === 'failed' ? (
                    <div className="text-center p-3">
                      <p className="text-xl">↺</p>
                      <p className="text-xs text-gray-400 mt-1">Generation failed — try again</p>
                    </div>
                  ) : (
                    <div className="text-center p-3">
                      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                      <p className="text-xs text-gray-400 mt-2">Generating…</p>
                    </div>
                  )}
                  {a.status === 'completed' && a.url && (
                    <a href={a.url} download target="_blank" rel="noreferrer" className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-medium">
                      ↓ Download
                    </a>
                  )}
                </div>
                <div className="p-2">
                  <p className="text-xs text-gray-300 truncate">{a.prompt}</p>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[11px] text-gray-500">{fmtDate(a.created_at)}</p>
                    <button onClick={() => deleteAsset(a.id)} className="text-[11px] text-gray-600 hover:text-red-400 transition-colors">Remove</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
function MarketingPageInner() {
  const searchParams = useSearchParams()
  const [tab, setTab]             = useState<Tab>('social')
  const [status, setStatus]       = useState<{ ads: Record<string, { configured: boolean; connected: boolean }>; social: Record<string, { connected: boolean }> } | null>(null)
  const [toast, setToast]         = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    try { setStatus(await api.adminMarketing.status()) }
    catch { /* non-fatal */ }
  }, [])

  useEffect(() => {
    loadStatus()
    const connected = searchParams.get('connected')
    if (connected) {
      setToast(`${connected} connected successfully!`)
      setTimeout(() => setToast(null), 4000)
      // auto-select right tab
      const socialIds = SOCIAL_PLATFORMS.map(p => p.id)
      setTab(socialIds.includes(connected) ? 'social' : 'ads')
    }
  }, [loadStatus, searchParams])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'social',   label: 'Social Media' },
    { id: 'ads',      label: 'Advertising' },
    { id: 'creative', label: 'AI Creative Studio' },
  ]

  return (
    <div className="flex-1 bg-gray-950 min-h-screen text-white">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">CarefulServer Marketing</h1>
          <p className="text-xs text-gray-400 mt-0.5">Social posts, ad campaigns, and creative assets for the platform brand</p>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="mx-6 mt-4 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 rounded-lg px-4 py-3 text-sm flex items-center justify-between">
          ✓ {toast}
          <button onClick={() => setToast(null)} className="text-emerald-300">✕</button>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-800 px-6">
        <div className="flex gap-0">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-blue-500 text-white' : 'border-transparent text-gray-400 hover:text-white'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {tab === 'social' && (
          <SocialTab socialStatus={status?.social || {}} onRefreshStatus={loadStatus} />
        )}
        {tab === 'ads' && (
          <AdsTab adsStatus={status?.ads || {}} onRefreshStatus={loadStatus} />
        )}
        {tab === 'creative' && <CreativeTab />}
      </div>
    </div>
  )
}

export default function MarketingPage() {
  return (
    <Suspense fallback={<div className="flex-1 bg-gray-950 min-h-screen text-white flex items-center justify-center text-gray-500">Loading…</div>}>
      <MarketingPageInner />
    </Suspense>
  )
}
