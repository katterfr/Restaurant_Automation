'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { api, PlatformStatus } from '@/lib/api'

const PLATFORMS = [
  { key: 'meta',   label: 'Facebook & Instagram', desc: 'Posts to your Facebook Page' },
  { key: 'tiktok', label: 'TikTok',               desc: 'Posts as a TikTok photo/video' },
]

export default function NewPostPage() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug ?? ''
  const router = useRouter()

  const [platformStatus, setPlatformStatus] = useState<Record<string, PlatformStatus>>({})
  const [selected, setSelected] = useState<string[]>([])
  const [content, setContent] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<Record<string, { status: string; error?: string }> | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.ads.status().then(setPlatformStatus).catch(() => {})
  }, [])

  function toggle(key: string) {
    setSelected(p => p.includes(key) ? p.filter(x => x !== key) : [...p, key])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected.length) { setError('Select at least one platform'); return }
    if (!content.trim())  { setError('Write some content first'); return }
    setSubmitting(true)
    setError('')
    try {
      const res = await api.social.create({
        platforms: selected,
        content,
        image_url: imageUrl || undefined,
        link_url:  linkUrl  || undefined,
      })
      setResult(res.results)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Post failed')
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent'

  if (result) {
    return (
      <div className="max-w-lg space-y-6">
        <div>
          <Link href={`/portal/${slug}/social`} className="text-sm text-gray-400 hover:text-gray-600">← Social Media</Link>
          <h1 className="text-xl font-bold text-gray-900 mt-1">Post Results</h1>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {Object.entries(result).map(([platform, r]) => (
            <div key={platform} className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-sm font-medium text-gray-900 capitalize">{PLATFORMS.find(p => p.key === platform)?.label ?? platform}</p>
                {r.error && <p className="text-xs text-red-500 mt-0.5">{r.error}</p>}
                {r.status === 'not_connected' && <p className="text-xs text-amber-600 mt-0.5">Connect this platform first in the Ads section</p>}
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                r.status === 'published' ? 'bg-green-100 text-green-700' :
                r.status === 'failed'    ? 'bg-red-100 text-red-600' :
                'bg-amber-100 text-amber-700'
              }`}>{r.status}</span>
            </div>
          ))}
        </div>
        <button
          onClick={() => router.push(`/portal/${slug}/social`)}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          View All Posts
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <Link href={`/portal/${slug}/social`} className="text-sm text-gray-400 hover:text-gray-600">← Social Media</Link>
        <h1 className="text-xl font-bold text-gray-900 mt-1">Create Post</h1>
        <p className="text-sm text-gray-400 mt-0.5">Publish to multiple platforms at once with one click.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Platform selection */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Post to</p>
          <div className="space-y-2">
            {PLATFORMS.map(p => {
              const s = platformStatus[p.key]
              const isSelected = selected.includes(p.key)
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => toggle(p.key)}
                  className={`w-full flex items-center gap-3 border-2 rounded-xl px-4 py-3 text-left transition-all ${
                    isSelected ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${isSelected ? 'border-green-500 bg-green-500' : 'border-gray-300'}`}>
                    {isSelected && <span className="text-white text-xs">✓</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{p.label}</p>
                    <p className="text-xs text-gray-400">{p.desc}</p>
                  </div>
                  {s && !s.connected && (
                    <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full shrink-0">Not connected</span>
                  )}
                  {s?.connected && (
                    <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full shrink-0">Connected ✓</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Content */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Post Content</label>
          <textarea
            required
            rows={5}
            value={content}
            onChange={e => setContent(e.target.value)}
            className={`${inputCls} resize-none`}
            placeholder="What's on the menu today? Share a special, promotion, or update with your followers…"
            maxLength={2200}
          />
          <p className="text-xs text-gray-400 mt-1 text-right">{content.length}/2200</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Image URL <span className="text-gray-400 font-normal">(optional)</span></label>
            <input type="url" value={imageUrl} onChange={e => setImageUrl(e.target.value)} className={inputCls} placeholder="https://…/photo.jpg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Link URL <span className="text-gray-400 font-normal">(optional)</span></label>
            <input type="url" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} className={inputCls} placeholder="https://yoursite.com" />
          </div>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            {submitting ? 'Publishing…' : '🚀 Publish Now'}
          </button>
          <Link href={`/portal/${slug}/social`} className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
