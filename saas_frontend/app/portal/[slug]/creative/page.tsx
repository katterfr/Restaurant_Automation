'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import { api, CreativeAsset } from '@/lib/api'
import { useCustomization } from '../tenant-context'
import Link from 'next/link'

// ── constants ─────────────────────────────────────────────────────────────────

const STYLES = [
  { key: 'photorealistic', label: 'Photo Real',  desc: 'Pro food photography' },
  { key: 'vibrant',        label: 'Vibrant',      desc: 'Bold & eye-catching' },
  { key: 'minimal',        label: 'Minimal',      desc: 'Clean & elegant' },
  { key: 'dark_moody',     label: 'Dark & Moody', desc: 'Cinematic atmosphere' },
  { key: 'social',         label: 'Social',       desc: 'Casual lifestyle feel' },
]

const IMAGE_RATIOS = [
  { key: '1:1',  label: '1:1',   sub: 'Instagram / Facebook' },
  { key: '16:9', label: '16:9',  sub: 'YouTube / Banner' },
  { key: '9:16', label: '9:16',  sub: 'Story / TikTok' },
  { key: '4:5',  label: '4:5',   sub: 'Instagram Feed' },
]

const VIDEO_RATIOS = [
  { key: '16:9', label: '16:9', sub: 'Landscape' },
  { key: '9:16', label: '9:16', sub: 'Vertical / Stories' },
  { key: '1:1',  label: '1:1',  sub: 'Square' },
]

const PROMPT_TEMPLATES = [
  { label: '🍔 Food hero shot',    prompt: 'A mouth-watering close-up hero shot of our signature dish, perfectly plated, steam rising, garnished with fresh herbs' },
  { label: '🏮 Restaurant ambiance', prompt: 'Warm inviting restaurant interior, cozy lighting, happy guests dining, elegant table settings' },
  { label: '🎉 Special offer banner', prompt: 'Vibrant promotional image showcasing a weekend special deal, festive atmosphere, delicious food spread' },
  { label: '🌿 Fresh ingredients',    prompt: 'Fresh colorful ingredients artfully arranged, farm-to-table feel, natural lighting, top-down flat lay' },
  { label: '👨‍🍳 Chef in action',       prompt: 'Professional chef preparing a dish in a modern kitchen, action shot, culinary artistry, dramatic lighting' },
  { label: '🥂 Dining experience',    prompt: 'Elegant dining table setup with beautifully plated food, wine glasses, warm candlelight, romantic atmosphere' },
]

// ── helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const d = Date.now() - new Date(iso).getTime()
  const m = Math.floor(d / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ── AssetCard ─────────────────────────────────────────────────────────────────

function AssetCard({ asset, accent, onDelete, onUseInAd }: {
  asset: CreativeAsset
  accent: string
  onDelete: (id: number) => void
  onUseInAd: (url: string) => void
}) {
  const [playing, setPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  function togglePlay() {
    if (!videoRef.current) return
    if (playing) { videoRef.current.pause(); setPlaying(false) }
    else { videoRef.current.play(); setPlaying(true) }
  }

  const isVideo = asset.type === 'video'
  const done = asset.status === 'completed'
  const failed = asset.status === 'failed'
  const processing = asset.status === 'processing' || asset.status === 'pending'

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden group">
      {/* Media area */}
      <div className="relative bg-gray-100 aspect-square overflow-hidden">
        {done && asset.url ? (
          isVideo ? (
            <>
              <video
                ref={videoRef}
                src={asset.url}
                className="w-full h-full object-cover"
                loop
                muted
                playsInline
                onEnded={() => setPlaying(false)}
              />
              <button
                onClick={togglePlay}
                className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <span className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center text-lg shadow-lg">
                  {playing ? '⏸' : '▶'}
                </span>
              </button>
              <span className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">Video</span>
            </>
          ) : (
            <img src={asset.url} alt={asset.prompt} className="w-full h-full object-cover" />
          )
        ) : processing ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            <p className="text-xs text-gray-500">{isVideo ? 'Generating video…' : 'Generating image…'}</p>
            <p className="text-xs text-gray-400">{isVideo ? '~1–2 min' : '~15 sec'}</p>
          </div>
        ) : failed ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center px-4">
              <span className="text-3xl">⚠️</span>
              <p className="text-xs text-red-500 mt-2">{asset.error_message || 'Generation failed'}</p>
            </div>
          </div>
        ) : null}

        {/* Style badge */}
        {done && (
          <span className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full capitalize">
            {asset.style?.replace('_', ' ')} · {asset.aspect_ratio}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-3 space-y-2">
        <p className="text-xs text-gray-600 line-clamp-2">{asset.prompt}</p>
        <p className="text-xs text-gray-400">{timeAgo(asset.created_at)}</p>

        {done && asset.url && (
          <div className="flex gap-2 pt-1">
            <a
              href={asset.url}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 text-center text-xs border border-gray-200 hover:bg-gray-50 text-gray-600 py-1.5 rounded-lg transition-colors"
            >
              ↓ Download
            </a>
            {!isVideo && (
              <button
                onClick={() => onUseInAd(asset.url!)}
                className="flex-1 text-xs text-white py-1.5 rounded-lg transition-opacity hover:opacity-90"
                style={{ backgroundColor: accent }}
              >
                Use in Ad
              </button>
            )}
          </div>
        )}

        <button
          onClick={() => onDelete(asset.id)}
          className="w-full text-xs text-gray-300 hover:text-red-400 transition-colors pt-0.5"
        >
          Remove
        </button>
      </div>
    </div>
  )
}

// ── Generate panel ────────────────────────────────────────────────────────────

function GeneratePanel({ mode, accent, onGenerated }: {
  mode: 'image' | 'video'
  accent: string
  onGenerated: (asset: CreativeAsset) => void
}) {
  const [prompt, setPrompt] = useState('')
  const [style, setStyle] = useState('photorealistic')
  const [ratio, setRatio] = useState(mode === 'video' ? '16:9' : '1:1')
  const [imageUrl, setImageUrl] = useState('')
  const [duration, setDuration] = useState(5)
  const [videoMode, setVideoMode] = useState<'text' | 'image'>('text')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const ratioOptions = mode === 'video' ? VIDEO_RATIOS : IMAGE_RATIOS

  async function generate() {
    if (!prompt.trim()) { setError('Enter a prompt first'); return }
    setLoading(true)
    setError('')
    try {
      if (mode === 'image') {
        const res = await api.creative.generateImage({ prompt, style, aspect_ratio: ratio })
        onGenerated({ id: res.id, type: 'image', status: res.status as CreativeAsset['status'], prompt, style, aspect_ratio: ratio, url: res.url, thumbnail_url: null, error_message: null, created_at: new Date().toISOString(), tenant_id: 0 })
      } else {
        const res = await api.creative.generateVideo({
          prompt,
          image_url: videoMode === 'image' && imageUrl ? imageUrl : undefined,
          duration,
          aspect_ratio: ratio,
          style,
        })
        onGenerated({ id: res.id, type: 'video', status: 'processing', prompt, style, aspect_ratio: ratio, url: null, thumbnail_url: videoMode === 'image' ? imageUrl || null : null, error_message: null, created_at: new Date().toISOString(), tenant_id: 0 })
      }
      setPrompt('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:border-transparent'

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-5">
      <h3 className="text-sm font-semibold text-gray-900">
        {mode === 'image' ? '🖼 Generate Image' : '🎬 Generate Video'}
      </h3>

      {/* Prompt templates */}
      <div>
        <p className="text-xs font-medium text-gray-500 mb-2">Quick templates</p>
        <div className="flex flex-wrap gap-2">
          {PROMPT_TEMPLATES.map(t => (
            <button
              key={t.label}
              onClick={() => setPrompt(t.prompt)}
              className="text-xs bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 px-2.5 py-1 rounded-full transition-colors"
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Prompt */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">
          Describe your ad creative
        </label>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          rows={3}
          className={`${inputCls} resize-none`}
          placeholder={mode === 'image'
            ? 'e.g. A steaming bowl of our signature ramen, rich broth, perfectly cooked egg, fresh toppings...'
            : 'e.g. Slow pan over a sizzling burger on the grill, steam rising, golden bun, cinematic...'}
        />
        <p className="text-xs text-gray-400 mt-1">
          Be specific — describe lighting, mood, ingredients, angle.
        </p>
      </div>

      {/* Video mode selector */}
      {mode === 'video' && (
        <div>
          <p className="text-xs font-medium text-gray-600 mb-2">Video type</p>
          <div className="flex gap-2">
            {([['text', '✏️ Text to Video'], ['image', '🖼 Animate an Image']] as const).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setVideoMode(k)}
                className={`flex-1 text-xs py-2 rounded-lg border transition-colors ${videoMode === k ? 'border-2 font-medium' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                style={videoMode === k ? { borderColor: accent, color: accent, backgroundColor: `${accent}10` } : {}}
              >
                {l}
              </button>
            ))}
          </div>
          {videoMode === 'image' && (
            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Image URL to animate</label>
              <input
                type="url"
                value={imageUrl}
                onChange={e => setImageUrl(e.target.value)}
                className={inputCls}
                placeholder="https://... (use a generated image URL or your own)"
              />
              {imageUrl && <img src={imageUrl} alt="" className="mt-2 h-20 w-20 rounded-lg object-cover border border-gray-200" />}
            </div>
          )}
        </div>
      )}

      {/* Style */}
      <div>
        <p className="text-xs font-medium text-gray-600 mb-2">Style</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {STYLES.map(s => (
            <button
              key={s.key}
              onClick={() => setStyle(s.key)}
              className={`text-center text-xs py-2 px-1 rounded-xl border transition-all ${style === s.key ? 'border-2 font-semibold' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
              style={style === s.key ? { borderColor: accent, color: accent, backgroundColor: `${accent}10` } : {}}
            >
              <div className="font-medium">{s.label}</div>
              <div className="text-gray-400 text-xs mt-0.5 hidden sm:block">{s.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Aspect ratio */}
      <div>
        <p className="text-xs font-medium text-gray-600 mb-2">Aspect ratio</p>
        <div className="flex gap-2 flex-wrap">
          {ratioOptions.map(r => (
            <button
              key={r.key}
              onClick={() => setRatio(r.key)}
              className={`text-xs py-1.5 px-3 rounded-lg border transition-colors ${ratio === r.key ? 'border-2 font-medium' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
              style={ratio === r.key ? { borderColor: accent, color: accent, backgroundColor: `${accent}10` } : {}}
            >
              <span className="font-mono">{r.label}</span>
              <span className="text-gray-400 ml-1.5 text-xs">{r.sub}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Duration (video only) */}
      {mode === 'video' && (
        <div>
          <p className="text-xs font-medium text-gray-600 mb-2">Duration</p>
          <div className="flex gap-2">
            {[5, 10].map(d => (
              <button
                key={d}
                onClick={() => setDuration(d)}
                className={`text-xs py-1.5 px-4 rounded-lg border transition-colors ${duration === d ? 'border-2 font-medium' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                style={duration === d ? { borderColor: accent, color: accent, backgroundColor: `${accent}10` } : {}}
              >
                {d}s
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      <button
        onClick={generate}
        disabled={loading || !prompt.trim()}
        className="w-full text-white py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
        style={{ backgroundColor: accent }}
      >
        {loading
          ? (mode === 'image' ? 'Generating image…' : 'Submitting video job…')
          : (mode === 'image' ? '✨ Generate Image' : '🎬 Generate Video')}
      </button>

      {mode === 'image' && <p className="text-xs text-gray-400 text-center">~5–15 seconds · Flux Schnell · high-quality AI images</p>}
      {mode === 'video' && <p className="text-xs text-gray-400 text-center">~60–120 seconds · AI video generation · auto-refresh when ready</p>}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CreativePage() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug ?? ''
  const customization = useCustomization()
  const accent = customization.accent_color || '#16a34a'

  const [assets, setAssets] = useState<CreativeAsset[]>([])
  const [configured, setConfigured] = useState(false)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'image' | 'video'>('image')
  const [filter, setFilter] = useState<'all' | 'image' | 'video'>('all')
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  const load = useCallback(async () => {
    try {
      const lib = await api.creative.library()
      setConfigured(lib.configured)
      setAssets(lib.assets)
    } catch { /* ignored */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Poll processing video assets every 12s
  useEffect(() => {
    const processing = assets.filter(a => a.type === 'video' && a.status === 'processing')
    if (processing.length === 0) { if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null } ; return }
    if (pollingRef.current) return
    pollingRef.current = setInterval(async () => {
      const updates = await Promise.all(
        processing.map(a => api.creative.videoStatus(a.id).catch(() => null))
      )
      let changed = false
      setAssets(prev => prev.map(a => {
        const u = updates.find(u => u?.id === a.id)
        if (!u) return a
        if (u.status !== a.status || u.url !== a.url) { changed = true; return { ...a, status: u.status as CreativeAsset['status'], url: u.url || null, error_message: u.error || null } }
        return a
      }))
      if (changed) clearInterval(pollingRef.current!); pollingRef.current = null
    }, 12000)
    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [assets])

  function handleGenerated(asset: CreativeAsset) {
    setAssets(prev => [asset, ...prev])
  }

  async function handleDelete(id: number) {
    if (!confirm('Remove this creative?')) return
    await api.creative.delete(id).catch(() => {})
    setAssets(prev => prev.filter(a => a.id !== id))
  }

  function handleUseInAd(url: string) {
    window.location.href = `/portal/${slug}/ads/new?image_url=${encodeURIComponent(url)}`
  }

  const filtered = filter === 'all' ? assets : assets.filter(a => a.type === filter)

  if (loading) return <div className="text-sm text-gray-400 py-20 text-center">Loading…</div>

  if (!configured) {
    return (
      <div className="max-w-lg">
        <h1 className="text-xl font-bold text-gray-900 mb-6">AI Creative Studio</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <p className="text-sm font-semibold text-amber-800">Replicate API token required</p>
          <p className="text-sm text-amber-700 mt-1">
            Add <span className="font-mono bg-white px-1 rounded">REPLICATE_API_TOKEN</span> to your Railway environment variables to enable AI image and video generation.
          </p>
          <p className="text-xs text-amber-600 mt-3">
            Get your token at <strong>replicate.com</strong> → Account Settings → API Tokens.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">AI Creative Studio</h1>
          <p className="text-sm text-gray-400 mt-0.5">Generate professional ad images and videos with AI</p>
        </div>
        <Link
          href={`/portal/${slug}/ads/new`}
          className="text-sm text-white px-4 py-2 rounded-lg transition-opacity hover:opacity-90"
          style={{ backgroundColor: accent }}
        >
          + Create Campaign
        </Link>
      </div>

      <div className="grid lg:grid-cols-[360px_1fr] gap-6">
        {/* Left: Generate panel */}
        <div className="space-y-3">
          {/* Mode tabs */}
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            {(['image', 'video'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === m ? 'bg-white shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                style={mode === m ? { color: accent } : {}}
              >
                {m === 'image' ? '🖼 Image' : '🎬 Video'}
              </button>
            ))}
          </div>
          <GeneratePanel key={mode} mode={mode} accent={accent} onGenerated={handleGenerated} />
        </div>

        {/* Right: Library */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Creative Library</h2>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {(['all', 'image', 'video'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`text-xs px-3 py-1 rounded-md capitalize transition-colors ${filter === f ? 'bg-white shadow-sm font-medium' : 'text-gray-500'}`}
                  style={filter === f ? { color: accent } : {}}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center">
              <p className="text-4xl mb-3">✨</p>
              <p className="text-gray-500 text-sm font-medium">No creatives yet</p>
              <p className="text-gray-400 text-xs mt-1">
                Use the panel on the left to generate your first ad image or video.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {filtered.map(asset => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  accent={accent}
                  onDelete={handleDelete}
                  onUseInAd={handleUseInAd}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
