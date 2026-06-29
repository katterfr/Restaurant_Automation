'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { api, SocialPost, PlatformStatus, MetaAccountInfo } from '@/lib/api'

const SOCIAL_PLATFORMS = [
  { key: 'meta',           label: 'Facebook & Instagram', sub: 'Posts, Reels & Stories', color: 'bg-blue-600' },
  { key: 'tiktok_content', label: 'TikTok',               sub: 'Photos & Videos',         color: 'bg-gray-900' },
  { key: 'youtube',        label: 'YouTube',               sub: 'Videos',                  color: 'bg-red-600' },
]

function PlatformIcon({ k, size = 10 }: { k: string; size?: number }) {
  const s = `w-${size} h-${size} rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0`
  if (k === 'meta')           return <div className={`${s} bg-blue-600`}>f</div>
  if (k === 'tiktok_content') return <div className={`${s} bg-gray-900 border border-gray-300`}>TT</div>
  if (k === 'youtube')        return <div className={`${s} bg-red-600`}>▶</div>
  return <div className={`${s} bg-gray-400`}>?</div>
}

function statusBadge(s: string) {
  const base = 'text-xs px-2 py-0.5 rounded-full font-medium'
  if (s === 'published') return `${base} bg-green-100 text-green-700`
  if (s === 'partial')   return `${base} bg-amber-100 text-amber-700`
  if (s === 'failed')    return `${base} bg-red-100 text-red-600`
  return `${base} bg-gray-100 text-gray-500`
}

function parsePlatforms(raw: string): string[] {
  try { return JSON.parse(raw) } catch { return [] }
}

const LABEL: Record<string, string> = {
  meta: 'Facebook/Instagram',
  tiktok_content: 'TikTok',
  youtube: 'YouTube',
}

interface MetaSetupInfo {
  configured: boolean
  callback_url: string
  required_scopes: string[]
  requirements: string[]
  instagram_setup_url: string
}

export default function SocialPage() {
  const params      = useParams<{ slug: string }>()
  const searchParams = useSearchParams()
  const slug        = params?.slug ?? ''

  const [posts,       setPosts]       = useState<SocialPost[]>([])
  const [status,      setStatus]      = useState<Record<string, PlatformStatus>>({})
  const [metaInfo,    setMetaInfo]    = useState<MetaAccountInfo | null>(null)
  const [metaSetup,   setMetaSetup]   = useState<MetaSetupInfo | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [connecting,  setConnecting]  = useState<string | null>(null)
  const [showMetaGuide, setShowMetaGuide] = useState(false)
  const [copiedUrl, setCopiedUrl]     = useState(false)

  const load = useCallback(async () => {
    try {
      const [p, s, setup] = await Promise.all([
        api.social.posts().catch(() => [] as SocialPost[]),
        api.ads.status().catch(() => ({})),
        api.ads.metaSetup().catch(() => null),
      ])
      setPosts(p)
      const st = s as Record<string, PlatformStatus>
      setStatus(st)
      setMetaSetup(setup)
      if (st.meta?.connected) {
        api.ads.metaAccountInfo().then(setMetaInfo).catch(() => {})
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const connected = searchParams?.get('connected')
    if (connected) load()
  }, [searchParams, load])

  async function connect(platform: string) {
    if (platform === 'meta' && !metaSetup?.configured) {
      setShowMetaGuide(true)
      return
    }
    setConnecting(platform)
    try {
      const { oauth_url } = await api.ads.connectUrl(platform, 'social')
      window.location.href = oauth_url
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Connect failed'
      if (msg.toLowerCase().includes('not yet configured')) {
        setShowMetaGuide(true)
      } else {
        alert(msg)
      }
      setConnecting(null)
    }
  }

  async function disconnect(platform: string) {
    if (!confirm(`Disconnect ${LABEL[platform] ?? platform}?`)) return
    await api.ads.disconnect(platform)
    setMetaInfo(null)
    await load()
  }

  async function deletePost(id: number) {
    if (!confirm('Delete this post?')) return
    await api.social.delete(id)
    await load()
  }

  function copyCallbackUrl() {
    if (metaSetup?.callback_url) {
      navigator.clipboard.writeText(metaSetup.callback_url)
      setCopiedUrl(true)
      setTimeout(() => setCopiedUrl(false), 2000)
    }
  }

  const connectedPlatform = searchParams?.get('connected')

  return (
    <div className="space-y-8 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Social Media</h1>
          <p className="text-sm text-gray-400 mt-0.5">Connect your accounts and publish to all platforms at once.</p>
        </div>
        <Link
          href={`/portal/${slug}/social/new`}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Create Post
        </Link>
      </div>

      {/* Success toast */}
      {connectedPlatform && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-2">
          <span className="text-green-600 text-lg">✓</span>
          <p className="text-sm text-green-700 font-medium">
            {LABEL[connectedPlatform] ?? connectedPlatform} connected successfully!
          </p>
        </div>
      )}

      {/* Meta Setup Guide Modal */}
      {showMetaGuide && metaSetup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-lg">f</div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Connect Facebook & Instagram</h2>
                  <p className="text-xs text-gray-400">Setup required before owners can connect</p>
                </div>
              </div>
              <button onClick={() => setShowMetaGuide(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            {!metaSetup.configured ? (
              <>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-amber-800 mb-1">⚠ Meta App credentials not configured</p>
                  <p className="text-sm text-amber-700">Add <code className="bg-amber-100 px-1 rounded">META_APP_ID</code> and <code className="bg-amber-100 px-1 rounded">META_APP_SECRET</code> to your Railway environment variables.</p>
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-semibold text-gray-700">Setup steps:</p>
                  <ol className="space-y-2 text-sm text-gray-600 list-none">
                    {[
                      ['1', 'Go to developers.facebook.com/apps → select your app'],
                      ['2', 'App Settings → Basic → copy App ID and App Secret'],
                      ['3', 'Add META_APP_ID and META_APP_SECRET to Railway env vars'],
                      ['4', 'Facebook Login → Settings → add this URL to Valid OAuth Redirect URIs:'],
                      ['5', 'Set App to Live mode so restaurant owners can log in'],
                    ].map(([n, text]) => (
                      <li key={n} className="flex gap-2">
                        <span className="w-5 h-5 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">{n}</span>
                        <span>{text}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-gray-700">What restaurant owners need:</p>
                  <ul className="space-y-2">
                    {metaSetup.requirements.map((req, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                        <span className="text-green-500 mt-0.5">✓</span>
                        {req}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
                  <p className="text-xs font-semibold text-amber-800">Instagram requires a Business or Creator account</p>
                  <p className="text-xs text-amber-700">If owners have a personal Instagram, they need to convert it to a Business account first, then link it to their Facebook Page.</p>
                  <a href={metaSetup.instagram_setup_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">Learn how to link Instagram to Facebook Page →</a>
                </div>
              </>
            )}

            {/* Callback URL — always show */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-1">
              <p className="text-xs font-semibold text-gray-600">OAuth Redirect URI (add this in Meta Developer Console):</p>
              <div className="flex items-center gap-2">
                <code className="text-xs text-gray-800 bg-white border border-gray-200 rounded-lg px-2 py-1.5 flex-1 truncate">
                  {metaSetup.callback_url}
                </code>
                <button onClick={copyCallbackUrl} className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg shrink-0 transition-colors">
                  {copiedUrl ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-[11px] text-gray-400">Facebook Login → Settings → Valid OAuth Redirect URIs</p>
            </div>

            {metaSetup.configured && (
              <button
                onClick={() => { setShowMetaGuide(false); connect('meta') }}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors"
              >
                Continue to Connect with Facebook
              </button>
            )}
          </div>
        </div>
      )}

      {/* Connected Accounts */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Connected Accounts</p>
        <div className="space-y-3">
          {SOCIAL_PLATFORMS.map(p => {
            const s = status[p.key]
            const isConnected = !!s?.connected
            const isConfigured = s?.configured !== false // undefined = assume configured
            return (
              <div key={p.key} className="bg-white border border-gray-200 rounded-2xl px-5 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <PlatformIcon k={p.key} />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{p.label}</p>
                      <p className="text-xs text-gray-400">{p.sub}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {isConnected && (
                      <span className="text-xs bg-green-100 text-green-700 px-2.5 py-0.5 rounded-full font-medium">Connected</span>
                    )}
                    {!isConnected && !isConfigured && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-0.5 rounded-full font-medium">Setup pending</span>
                    )}
                    {isConnected ? (
                      <button
                        onClick={() => disconnect(p.key)}
                        className="text-sm text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-200 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        onClick={() => connect(p.key)}
                        disabled={connecting === p.key}
                        className="bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                      >
                        {connecting === p.key && (
                          <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        )}
                        {connecting === p.key ? 'Redirecting…' : 'Connect'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Meta: show linked FB page + IG account once connected */}
                {p.key === 'meta' && isConnected && metaInfo && (
                  <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-4">
                    <div className="flex items-center gap-2">
                      {metaInfo.page_picture && (
                        <img src={metaInfo.page_picture} alt="" className="w-6 h-6 rounded-full" />
                      )}
                      <div>
                        <p className="text-xs text-gray-400">Facebook Page</p>
                        <p className="text-sm font-medium text-gray-900">{metaInfo.page_name || metaInfo.page_id}</p>
                      </div>
                    </div>
                    {metaInfo.ig_username ? (
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center">
                          <span className="text-white text-[9px] font-bold">IG</span>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Instagram</p>
                          <p className="text-sm font-medium text-gray-900">@{metaInfo.ig_username}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        <span className="text-amber-600 text-sm">⚠</span>
                        <div>
                          <p className="text-xs font-medium text-amber-800">No Instagram Business account found</p>
                          <p className="text-[11px] text-amber-600">Facebook posting works — to also post to Instagram, link an Instagram Business account to your Facebook Page.</p>
                        </div>
                        <button onClick={() => setShowMetaGuide(true)} className="text-xs text-blue-600 hover:underline ml-1 shrink-0">How?</button>
                      </div>
                    )}
                  </div>
                )}

                {/* Meta: show setup hint when not connected */}
                {p.key === 'meta' && !isConnected && (
                  <div className="mt-2 flex items-center gap-2">
                    <p className="text-xs text-gray-400">
                      Connects your Facebook Page + Instagram Business account.
                    </p>
                    <button onClick={() => setShowMetaGuide(true)} className="text-xs text-blue-500 hover:underline shrink-0">
                      Setup guide
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Post History */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Post History</p>

        {loading && <div className="text-sm text-gray-400 py-8 text-center">Loading…</div>}
        {error   && <div className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl p-4">{error}</div>}

        {!loading && !error && posts.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
            <p className="text-gray-500 font-medium">No posts yet</p>
            <p className="text-gray-400 text-sm mt-1">Connect a platform above, then create your first post.</p>
            <Link href={`/portal/${slug}/social/new`} className="inline-block mt-4 text-green-600 hover:underline text-sm font-medium">
              Create a post →
            </Link>
          </div>
        )}

        {!loading && posts.length > 0 && (
          <div className="space-y-3">
            {posts.map(post => {
              const platforms = parsePlatforms(post.platforms)
              let results: Record<string, { status: string; error?: string }> = {}
              try { results = JSON.parse(post.platform_results || '{}') } catch { /* */ }
              return (
                <div key={post.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 whitespace-pre-wrap line-clamp-3">{post.content}</p>
                      {post.image_url && (
                        <p className="text-xs text-blue-600 mt-1 truncate">Media attached</p>
                      )}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {platforms.map(p => (
                          <div key={p} className="flex items-center gap-1">
                            <PlatformIcon k={p} size={5} />
                            <span className="text-xs text-gray-500">{LABEL[p] ?? p}</span>
                          </div>
                        ))}
                      </div>
                      {/* Per-platform error messages */}
                      {Object.entries(results).map(([pid, r]) =>
                        r.status === 'failed' ? (
                          <p key={pid} className="text-xs text-red-500 mt-1 bg-red-50 rounded px-2 py-1">
                            {LABEL[pid] ?? pid}: {r.error ?? 'failed'}
                          </p>
                        ) : null
                      )}
                    </div>
                    <div className="text-right shrink-0 space-y-1.5">
                      <span className={statusBadge(post.status)}>{post.status}</span>
                      <p className="text-xs text-gray-400 block">{new Date(post.created_at).toLocaleDateString()}</p>
                      <button onClick={() => deletePost(post.id)} className="text-xs text-gray-300 hover:text-red-500 transition-colors block ml-auto">
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
