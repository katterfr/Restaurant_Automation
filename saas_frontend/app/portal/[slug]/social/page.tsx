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
  if (k === 'tiktok_content') return <div className={`${s} bg-gray-900`}>TT</div>
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

export default function SocialPage() {
  const params      = useParams<{ slug: string }>()
  const searchParams = useSearchParams()
  const slug        = params?.slug ?? ''

  const [posts,       setPosts]       = useState<SocialPost[]>([])
  const [status,      setStatus]      = useState<Record<string, PlatformStatus>>({})
  const [metaInfo,    setMetaInfo]    = useState<MetaAccountInfo | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [connecting,  setConnecting]  = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([api.social.posts(), api.ads.status().catch(() => ({}))])
      setPosts(p)
      const st = s as Record<string, PlatformStatus>
      setStatus(st)
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

  // Refresh after OAuth redirect back
  useEffect(() => {
    if (searchParams?.get('connected')) load()
  }, [searchParams, load])

  async function connect(platform: string) {
    setConnecting(platform)
    try {
      const { oauth_url } = await api.ads.connectUrl(platform, 'social')
      window.location.href = oauth_url
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Connect failed')
      setConnecting(null)
    }
  }

  async function disconnect(platform: string) {
    if (!confirm(`Disconnect ${LABEL[platform] ?? platform}?`)) return
    await api.ads.disconnect(platform)
    await load()
  }

  async function deletePost(id: number) {
    if (!confirm('Delete this post?')) return
    await api.social.delete(id)
    await load()
  }

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

      {/* Connected Accounts */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Connected Accounts</p>
        <div className="space-y-3">
          {SOCIAL_PLATFORMS.map(p => {
            const s = status[p.key]
            const isConnected = !!s?.connected
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
                    {isConnected && <span className="text-xs bg-green-100 text-green-700 px-2.5 py-0.5 rounded-full font-medium">Connected</span>}
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
                        {connecting === p.key && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                        {connecting === p.key ? 'Redirecting…' : 'Connect'}
                      </button>
                    )}
                  </div>
                </div>
                {/* Show Facebook page + Instagram account when Meta is connected */}
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
                    {metaInfo.ig_username && (
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center">
                          <span className="text-white text-[9px] font-bold">IG</span>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Instagram</p>
                          <p className="text-sm font-medium text-gray-900">@{metaInfo.ig_username}</p>
                        </div>
                      </div>
                    )}
                    {!metaInfo.ig_id && (
                      <p className="text-xs text-amber-600 self-center">No Instagram Business account linked to this page — connect one in Facebook Page Settings.</p>
                    )}
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
            <p className="text-gray-400 text-sm mt-1">Create your first post and publish to all platforms at once.</p>
            <Link href={`/portal/${slug}/social/new`} className="inline-block mt-4 text-green-600 hover:underline text-sm font-medium">
              Create a post →
            </Link>
          </div>
        )}

        {!loading && posts.length > 0 && (
          <div className="space-y-3">
            {posts.map(post => {
              const platforms = parsePlatforms(post.platforms)
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
