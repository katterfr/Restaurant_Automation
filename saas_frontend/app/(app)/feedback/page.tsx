'use client'
import { useEffect, useState } from 'react'
import { api, Testimonial } from '@/lib/api'

type Filter = 'all' | 'pending' | 'approved' | 'rejected'

function StarRow({ n }: { n: number }) {
  return (
    <span className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <span key={i} className={i <= n ? 'text-yellow-400' : 'text-gray-300'} style={{ fontSize: 14 }}>★</span>
      ))}
    </span>
  )
}

function YesNo({ val }: { val: boolean | null }) {
  if (val === null || val === undefined) return <span className="text-gray-400 text-xs">—</span>
  return val
    ? <span className="text-green-600 font-semibold text-xs bg-green-50 px-2 py-0.5 rounded-full">Yes</span>
    : <span className="text-red-500 font-semibold text-xs bg-red-50 px-2 py-0.5 rounded-full">No</span>
}

export default function FeedbackPage() {
  const [items, setItems] = useState<Testimonial[]>([])
  const [filter, setFilter] = useState<Filter>('pending')
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<number | null>(null)

  async function load(f: Filter) {
    setLoading(true)
    try {
      const data = await api.adminFeedback.list(f === 'all' ? undefined : f)
      setItems(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(filter) }, [filter])

  async function approve(id: number) {
    setActing(id)
    await api.adminFeedback.approve(id)
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'approved' } : i))
    setActing(null)
  }

  async function reject(id: number) {
    setActing(id)
    await api.adminFeedback.reject(id)
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'rejected' } : i))
    setActing(null)
  }

  const counts = {
    pending:  items.filter(i => i.status === 'pending').length,
    approved: items.filter(i => i.status === 'approved').length,
    rejected: items.filter(i => i.status === 'rejected').length,
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Feedback & Testimonials</h1>
        <p className="text-gray-500 text-sm mt-1">Review and approve restaurant owner feedback before it appears on the public website.</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {(['pending','approved','rejected','all'] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold capitalize transition-colors ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f}
            {f !== 'all' && <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${filter === f ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>{counts[f] ?? 0}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-200">
          <p className="text-4xl mb-3">📭</p>
          <p className="text-gray-500 font-medium">No {filter === 'all' ? '' : filter} feedback yet</p>
          <p className="text-gray-400 text-sm mt-1">Feedback will appear here once restaurant owners submit it from their portals.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map(item => (
            <div key={item.id} className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* Header row */}
                  <div className="flex items-center gap-3 flex-wrap mb-3">
                    <p className="font-bold text-gray-900">{item.restaurant_name}</p>
                    {item.owner_name && <p className="text-gray-500 text-sm">· {item.owner_name}</p>}
                    <StarRow n={item.star_rating} />
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${
                      item.status === 'approved' ? 'bg-green-50 text-green-700' :
                      item.status === 'rejected' ? 'bg-red-50 text-red-600' :
                      'bg-amber-50 text-amber-700'
                    }`}>{item.status}</span>
                    <span className="text-gray-400 text-xs">{new Date(item.created_at).toLocaleDateString()}</span>
                  </div>

                  {/* Yes/No answers */}
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    {[
                      { label: 'Satisfied overall?', val: item.q1_overall },
                      { label: 'Easy to use?',       val: item.q2_easy_to_use },
                      { label: 'Effective for business?', val: item.q3_effective },
                    ].map(q => (
                      <div key={q.label} className="bg-gray-50 rounded-xl px-3 py-2">
                        <p className="text-gray-500 text-xs mb-1">{q.label}</p>
                        <YesNo val={q.val} />
                      </div>
                    ))}
                  </div>

                  {/* Comment */}
                  {item.comment && (
                    <div className="bg-gray-50 rounded-xl px-4 py-3">
                      <p className="text-gray-700 text-sm leading-relaxed">"{item.comment}"</p>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                {item.status === 'pending' && (
                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      onClick={() => approve(item.id)}
                      disabled={acting === item.id}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors"
                    >
                      {acting === item.id ? '…' : '✓ Approve'}
                    </button>
                    <button
                      onClick={() => reject(item.id)}
                      disabled={acting === item.id}
                      className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors"
                    >
                      {acting === item.id ? '…' : '✗ Reject'}
                    </button>
                  </div>
                )}
                {item.status === 'approved' && (
                  <button
                    onClick={() => reject(item.id)}
                    disabled={acting === item.id}
                    className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors shrink-0"
                  >
                    Remove
                  </button>
                )}
                {item.status === 'rejected' && (
                  <button
                    onClick={() => approve(item.id)}
                    disabled={acting === item.id}
                    className="px-4 py-2 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors shrink-0"
                  >
                    Approve
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
