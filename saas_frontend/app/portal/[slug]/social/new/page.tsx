'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { api, PlatformStatus } from '@/lib/api'

const PLATFORMS = [
  { key: 'meta',           label: 'Facebook & Instagram', types: ['feed', 'reel', 'story'] },
  { key: 'tiktok_content', label: 'TikTok',               types: ['feed'] },
  { key: 'youtube',        label: 'YouTube',               types: ['feed'] },
]

const TYPE_LABELS: Record<string, string> = {
  feed:  'Feed Post',
  reel:  'Reel',
  story: 'Story',
}

function PlatformIcon({ k }: { k: string }) {
  const base = 'w-8 h-8 rounded-xl flex items-center justify-center text-white font-bold text-xs shrink-0'
  if (k === 'meta')           return <div className={`${base} bg-blue-600`}>f</div>
  if (k === 'tiktok_content') return <div className={`${base} bg-gray-900`}>TT</div>
  if (k === 'youtube')        return <div className={`${base} bg-red-600`}>▶</div>
  return <div className={`${base} bg-gray-400`}>?</div>
}

export default function NewPostPage() {
  const params = useParams<{ slug: string }>()
  const slug   = params?.slug ?? ''
  const router = useRouter()

  const [platformStatus, setPlatformStatus] = useState<Record<string, PlatformStatus>>({})
  const [enabledFeatures, setEnabledFeatures] = useState<string[]>([])
  const [selected, setSelected]   = useState<string[]>([])
  const [mediaType, setMediaType] = useState<string>('feed')
  const [content, setContent]     = useState('')
  const [linkUrl, setLinkUrl]     = useState('')

  const [mediaFile,    setMediaFile]    = useState<File | null>(null)
  const [mediaPreview, setMediaPreview] = useState<string>('')
  const [isVideo,      setIsVideo]      = useState(false)
  const [uploadedUrl,  setUploadedUrl]  = useState('')
  const [uploading,    setUploading]    = useState(false)
  const [uploadErr,    setUploadErr]    = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [result,     setResult]     = useState<Record<string, { status: string; error?: string }> | null>(null)
  const [error,      setError]      = useState('')

  const fileRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    Promise.all([
      api.ads.status().catch(() => ({})),
      api.portal.features().catch(() => [] as string[]),
    ]).then(([s, f]) => {
      setPlatformStatus(s as Record<string, PlatformStatus>)
      setEnabledFeatures(f)
    })
  }, [])

  const availablePlatforms = PLATFORMS.filter(p =>
    enabledFeatures.includes(`social_${p.key.replace('_content', '')}`) ||
    enabledFeatures.includes('social_posts')
  )

  function toggle(key: string) {
    setSelected(p => p.includes(key) ? p.filter(x => x !== key) : [...p, key])
  }

  const handleFile = useCallback(async (file: File) => {
    const preview = URL.createObjectURL(file)
    setMediaFile(file)
    setMediaPreview(preview)
    setIsVideo(file.type.startsWith('video/'))
    setUploadedUrl('')
    setUploadErr('')
    setUploading(true)
    try {
      const res = await api.social.upload(file)
      setUploadedUrl(res.url)
      setIsVideo(res.is_video)
    } catch (e: unknown) {
      setUploadErr(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }, [])

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (f) handleFile(f)
  }

  function clearMedia() {
    setMediaFile(null)
    setMediaPreview('')
    setUploadedUrl('')
    setIsVideo(false)
    setUploadErr('')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected.length) { setError('Select at least one platform'); return }
    if (!content.trim())  { setError('Write some content first'); return }
    if (mediaFile && !uploadedUrl && !uploadErr) { setError('Media is still uploading, please wait'); return }
    if (uploadErr) { setError('Fix the media upload error before publishing'); return }
    setSubmitting(true); setError('')
    try {
      const res = await api.social.create({
        platforms:  selected,
        content,
        image_url:  !isVideo ? uploadedUrl || undefined : undefined,
        video_url:  isVideo  ? uploadedUrl || undefined : undefined,
        link_url:   linkUrl  || undefined,
        media_type: mediaType,
      })
      setResult(res.results)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Post failed')
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent'

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
              <div className="flex items-center gap-3">
                <PlatformIcon k={platform} />
                <div>
                  <p className="text-sm font-medium text-gray-900">{PLATFORMS.find(p => p.key === platform)?.label ?? platform}</p>
                  {r.error          && <p className="text-xs text-red-500 mt-0.5">{r.error}</p>}
                  {r.status === 'not_connected' && <p className="text-xs text-amber-600 mt-0.5">Connect this account first on the Social page</p>}
                </div>
              </div>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                r.status === 'published' ? 'bg-green-100 text-green-700' :
                r.status === 'failed'    ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'
              }`}>{r.status}</span>
            </div>
          ))}
        </div>
        <button
          onClick={() => router.push(`/portal/${slug}/social`)}
          className="bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          View All Posts
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-xl space-y-7">
      <div>
        <Link href={`/portal/${slug}/social`} className="text-sm text-gray-400 hover:text-gray-600">← Social Media</Link>
        <h1 className="text-xl font-bold text-gray-900 mt-1">Create Post</h1>
        <p className="text-sm text-gray-400 mt-0.5">Publish to multiple platforms at once.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Platform + post type */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Post to</p>
          <div className="space-y-2">
            {availablePlatforms.map(p => {
              const s = platformStatus[p.key]
              const isSel = selected.includes(p.key)
              return (
                <div key={p.key} className={`border-2 rounded-xl overflow-hidden transition-all ${isSel ? 'border-green-500' : 'border-gray-200'}`}>
                  <button
                    type="button"
                    onClick={() => toggle(p.key)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left ${isSel ? 'bg-green-50' : 'bg-white hover:bg-gray-50'}`}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${isSel ? 'border-green-500 bg-green-500' : 'border-gray-300'}`}>
                      {isSel && <span className="text-white text-xs font-bold">✓</span>}
                    </div>
                    <PlatformIcon k={p.key} />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{p.label}</p>
                    </div>
                    {s?.connected
                      ? <span className="text-xs text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full shrink-0">Connected</span>
                      : <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full shrink-0">Not connected</span>
                    }
                  </button>

                  {/* Post type selector — shown when platform supports multiple types and Meta is selected */}
                  {isSel && p.types.length > 1 && p.key === 'meta' && (
                    <div className="flex border-t border-gray-100 divide-x divide-gray-100 bg-white">
                      {p.types.map(t => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setMediaType(t)}
                          className={`flex-1 text-xs py-2 font-medium transition-colors ${mediaType === t ? 'bg-green-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                        >
                          {TYPE_LABELS[t]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Media upload */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">
            Media <span className="text-gray-400 font-normal">
              {mediaType === 'reel' ? '(video required)' : mediaType === 'story' ? '(image or video)' : '(optional)'}
            </span>
          </p>

          {!mediaFile ? (
            <div
              ref={dropRef}
              onDrop={onDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-gray-300 hover:border-green-400 rounded-xl p-8 text-center cursor-pointer transition-colors"
            >
              <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/></svg>
              <p className="text-sm text-gray-600 font-medium">Drop a photo or video here</p>
              <p className="text-xs text-gray-400 mt-1">or click to browse from your device</p>
              <p className="text-xs text-gray-300 mt-2">JPG, PNG, GIF, MP4, MOV up to 500 MB</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
                onChange={onFileInput}
                className="hidden"
              />
            </div>
          ) : (
            <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
              {isVideo
                ? <video src={mediaPreview} className="w-full max-h-72 object-contain bg-black" controls />
                : <img src={mediaPreview} alt="preview" className="w-full max-h-72 object-contain" />
              }
              <div className="absolute top-2 right-2 flex gap-2">
                {uploading && (
                  <span className="bg-white/90 text-xs text-gray-600 px-2 py-1 rounded-lg flex items-center gap-1">
                    <span className="w-3 h-3 border-2 border-gray-300 border-t-green-600 rounded-full animate-spin" />
                    Uploading…
                  </span>
                )}
                {uploadedUrl && !uploading && (
                  <span className="bg-green-500 text-white text-xs px-2 py-1 rounded-lg">✓ Ready</span>
                )}
                <button
                  type="button"
                  onClick={clearMedia}
                  className="bg-white/90 text-gray-600 hover:text-red-600 text-xs px-2 py-1 rounded-lg border border-gray-200"
                >
                  Remove
                </button>
              </div>
              {uploadErr && (
                <div className="px-3 py-2 bg-red-50 border-t border-red-200 text-xs text-red-600">{uploadErr}</div>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Caption / Post Content</label>
          <textarea
            required
            rows={5}
            value={content}
            onChange={e => setContent(e.target.value)}
            className={`${inputCls} resize-none`}
            placeholder="What's on the menu today? Share a special, a promotion, or what's happening at your restaurant…"
            maxLength={2200}
          />
          <p className="text-xs text-gray-400 mt-1 text-right">{content.length}/2200</p>
        </div>

        {/* Link (feed posts only) */}
        {mediaType === 'feed' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Link URL <span className="text-gray-400 font-normal">(optional)</span></label>
            <input type="url" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} className={inputCls} placeholder="https://yoursite.com/menu" />
          </div>
        )}

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting || uploading}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
          >
            {submitting && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {submitting ? 'Publishing…' : 'Publish Now'}
          </button>
          <Link href={`/portal/${slug}/social`} className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
