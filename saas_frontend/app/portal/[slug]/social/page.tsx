'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { api, SocialPost } from '@/lib/api'

const PLATFORM_LABELS: Record<string, { label: string; color: string }> = {
  meta:    { label: 'Facebook/Instagram', color: 'bg-blue-100 text-blue-700' },
  youtube: { label: 'YouTube',            color: 'bg-red-100 text-red-700' },
  tiktok:  { label: 'TikTok',             color: 'bg-gray-900 text-white' },
}

function statusBadge(s: string) {
  const base = 'text-xs px-2 py-0.5 rounded-full font-medium'
  if (s === 'published') return `${base} bg-green-100 text-green-700`
  if (s === 'partial')   return `${base} bg-amber-100 text-amber-700`
  if (s === 'failed')    return `${base} bg-red-100 text-red-600`
  if (s === 'scheduled') return `${base} bg-blue-100 text-blue-700`
  return `${base} bg-gray-100 text-gray-500`
}

function parsePlatforms(raw: string): string[] {
  try { return JSON.parse(raw) } catch { return [] }
}

export default function SocialPage() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug ?? ''
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try { setPosts(await api.social.posts()) }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function deletePost(id: number) {
    if (!confirm('Delete this post?')) return
    await api.social.delete(id)
    await load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Social Media</h1>
        <Link
          href={`/portal/${slug}/social/new`}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Create Post
        </Link>
      </div>

      {loading && <div className="text-sm text-gray-400 py-12 text-center">Loading…</div>}
      {error   && <div className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl p-4">{error}</div>}

      {!loading && !error && posts.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-2xl mb-3">📱</p>
          <p className="text-gray-600 font-medium">No posts yet</p>
          <p className="text-gray-400 text-sm mt-1">Create your first post and publish it to all your platforms at once.</p>
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
                      <p className="text-xs text-blue-600 mt-1 truncate">🖼 {post.image_url}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {platforms.map(p => (
                        <span key={p} className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLATFORM_LABELS[p]?.color ?? 'bg-gray-100 text-gray-600'}`}>
                          {PLATFORM_LABELS[p]?.label ?? p}
                        </span>
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
  )
}
