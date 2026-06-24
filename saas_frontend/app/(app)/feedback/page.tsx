'use client'
import { useEffect, useState } from 'react'
import { api, Testimonial, Suggestion } from '@/lib/api'

type FeedbackFilter = 'all' | 'pending' | 'approved' | 'rejected'
type SuggestionFilter = 'all' | 'pending' | 'approved' | 'rejected'
type Tab = 'feedback' | 'suggestions'

const CATEGORY_LABELS: Record<string, string> = {
  feature: 'Feature',
  ease_of_use: 'Ease of Use',
  security: 'Security',
  performance: 'Performance',
  ui_design: 'UI / Design',
  integration: 'Integration',
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high:     'bg-orange-100 text-orange-700',
  medium:   'bg-blue-100 text-blue-700',
  low:      'bg-gray-100 text-gray-600',
}

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

function FeedbackTab() {
  const [items, setItems] = useState<Testimonial[]>([])
  const [filter, setFilter] = useState<FeedbackFilter>('pending')
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<number | null>(null)

  async function load(f: FeedbackFilter) {
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

  const all = items
  const pending  = all.filter(i => i.status === 'pending').length
  const approved = all.filter(i => i.status === 'approved').length
  const rejected = all.filter(i => i.status === 'rejected').length

  return (
    <div>
      <div className="flex gap-2 mb-6">
        {(['pending','approved','rejected','all'] as FeedbackFilter[]).map(f => {
          const count = f === 'pending' ? pending : f === 'approved' ? approved : f === 'rejected' ? rejected : undefined
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold capitalize transition-colors ${
                filter === f ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f}
              {count !== undefined && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${filter === f ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-200">
          <p className="text-4xl mb-3">📭</p>
          <p className="text-gray-500 font-medium">No {filter === 'all' ? '' : filter} feedback yet</p>
          <p className="text-gray-400 text-sm mt-1">Feedback appears here once restaurant owners submit it from their portals.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map(item => (
            <div key={item.id} className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
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

                  <div className="grid grid-cols-3 gap-3 mb-3">
                    {[
                      { label: 'Satisfied overall?',       val: item.q1_overall },
                      { label: 'Easy to use?',             val: item.q2_easy_to_use },
                      { label: 'Effective for business?',  val: item.q3_effective },
                    ].map(q => (
                      <div key={q.label} className="bg-gray-50 rounded-xl px-3 py-2">
                        <p className="text-gray-500 text-xs mb-1">{q.label}</p>
                        <YesNo val={q.val} />
                      </div>
                    ))}
                  </div>

                  {item.comment && (
                    <div className="bg-gray-50 rounded-xl px-4 py-3">
                      <p className="text-gray-700 text-sm leading-relaxed">&ldquo;{item.comment}&rdquo;</p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 shrink-0">
                  {item.status === 'pending' && (
                    <>
                      <button onClick={() => approve(item.id)} disabled={acting === item.id}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors">
                        {acting === item.id ? '…' : '✓ Approve'}
                      </button>
                      <button onClick={() => reject(item.id)} disabled={acting === item.id}
                        className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors">
                        {acting === item.id ? '…' : '✗ Reject'}
                      </button>
                    </>
                  )}
                  {item.status === 'approved' && (
                    <button onClick={() => reject(item.id)} disabled={acting === item.id}
                      className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors">
                      Remove
                    </button>
                  )}
                  {item.status === 'rejected' && (
                    <button onClick={() => approve(item.id)} disabled={acting === item.id}
                      className="px-4 py-2 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors">
                      Approve
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SuggestionsTab() {
  const [items, setItems] = useState<Suggestion[]>([])
  const [filter, setFilter] = useState<SuggestionFilter>('pending')
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<number | null>(null)

  async function load(f: SuggestionFilter) {
    setLoading(true)
    try {
      const data = await api.adminFeedback.suggestions(f === 'all' ? undefined : f)
      setItems(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(filter) }, [filter])

  async function approve(id: number) {
    setActing(id)
    await api.adminFeedback.approveSuggestion(id)
    setItems(prev => prev.map(s => s.id === id ? { ...s, status: 'approved' } : s))
    setActing(null)
  }

  async function reject(id: number) {
    setActing(id)
    await api.adminFeedback.rejectSuggestion(id)
    setItems(prev => prev.map(s => s.id === id ? { ...s, status: 'rejected' } : s))
    setActing(null)
  }

  const pending  = items.filter(i => i.status === 'pending').length
  const approved = items.filter(i => i.status === 'approved').length
  const rejected = items.filter(i => i.status === 'rejected').length

  return (
    <div>
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-6 text-sm text-blue-700">
        <strong>AI-generated suggestions</strong> — these are automatically created by the Admin AI based on user feedback and interaction patterns. Review and approve before any changes are deployed.
      </div>

      <div className="flex gap-2 mb-6">
        {(['pending','approved','rejected','all'] as SuggestionFilter[]).map(f => {
          const count = f === 'pending' ? pending : f === 'approved' ? approved : f === 'rejected' ? rejected : undefined
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold capitalize transition-colors ${
                filter === f ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f}
              {count !== undefined && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${filter === f ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-200">
          <p className="text-4xl mb-3">🤖</p>
          <p className="text-gray-500 font-medium">No {filter === 'all' ? '' : filter} suggestions yet</p>
          <p className="text-gray-400 text-sm mt-1">Ask the Admin AI to analyze feedback and generate improvement ideas.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map(s => (
            <div key={s.id} className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-semibold">
                      {CATEGORY_LABELS[s.category] ?? s.category}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize ${PRIORITY_COLORS[s.priority] ?? 'bg-gray-100 text-gray-600'}`}>
                      {s.priority} priority
                    </span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${
                      s.status === 'approved' ? 'bg-green-50 text-green-700' :
                      s.status === 'rejected' ? 'bg-red-50 text-red-600' :
                      'bg-amber-50 text-amber-700'
                    }`}>{s.status}</span>
                    <span className="text-gray-400 text-xs">{s.source === 'ai' ? '🤖 AI' : '👤 Admin'} · {new Date(s.created_at).toLocaleDateString()}</span>
                  </div>
                  <p className="font-bold text-gray-900 text-base mb-2">{s.title}</p>
                  <p className="text-gray-600 text-sm leading-relaxed">{s.description}</p>
                </div>

                <div className="flex flex-col gap-2 shrink-0">
                  {s.status === 'pending' && (
                    <>
                      <button onClick={() => approve(s.id)} disabled={acting === s.id}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors">
                        {acting === s.id ? '…' : '✓ Approve'}
                      </button>
                      <button onClick={() => reject(s.id)} disabled={acting === s.id}
                        className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors">
                        {acting === s.id ? '…' : '✗ Reject'}
                      </button>
                    </>
                  )}
                  {s.status === 'approved' && (
                    <button onClick={() => reject(s.id)} disabled={acting === s.id}
                      className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors">
                      Revoke
                    </button>
                  )}
                  {s.status === 'rejected' && (
                    <button onClick={() => approve(s.id)} disabled={acting === s.id}
                      className="px-4 py-2 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors">
                      Approve
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function FeedbackPage() {
  const [tab, setTab] = useState<Tab>('feedback')

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Feedback & Improvements</h1>
        <p className="text-gray-500 text-sm mt-1">Review owner feedback for the public site, and manage AI-generated improvement suggestions.</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit mb-8">
        <button
          onClick={() => setTab('feedback')}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${tab === 'feedback' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          ★ Testimonials
        </button>
        <button
          onClick={() => setTab('suggestions')}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${tab === 'suggestions' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          🤖 AI Suggestions
        </button>
      </div>

      {tab === 'feedback' ? <FeedbackTab /> : <SuggestionsTab />}
    </div>
  )
}
