'use client'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { getRole } from '@/lib/auth'

interface Props {
  tenantId: number
  restaurantName: string
  accentColor?: string
}

const FIRST_LOGIN_KEY = (id: number) => `cs_first_login_${id}`
const LAST_FEEDBACK_KEY = (id: number) => `cs_last_feedback_${id}`
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000

const OWNER_QUESTIONS = [
  { key: 'q1', label: 'Are you satisfied with Careful Server overall?' },
  { key: 'q2', label: 'Is the platform easy to use and navigate?' },
  { key: 'q3', label: 'Has it been effective for your business?' },
]

const EMPLOYEE_QUESTIONS = [
  { key: 'q1', label: 'Do the tools in this portal make your daily tasks easier?' },
  { key: 'q2', label: 'Is the system intuitive and easy to navigate?' },
  { key: 'q3', label: 'Has this platform improved your productivity?' },
]

function shouldShowFeedback(tenantId: number): boolean {
  const firstLogin = localStorage.getItem(FIRST_LOGIN_KEY(tenantId))
  const lastFeedback = localStorage.getItem(LAST_FEEDBACK_KEY(tenantId))
  const now = Date.now()

  if (!firstLogin) {
    localStorage.setItem(FIRST_LOGIN_KEY(tenantId), String(now))
    return false
  }

  const daysSinceFirstLogin = now - Number(firstLogin)
  if (daysSinceFirstLogin < THREE_DAYS_MS) return false

  if (!lastFeedback) return true

  return now - Number(lastFeedback) >= FOURTEEN_DAYS_MS
}

export default function FeedbackModal({ tenantId, restaurantName, accentColor = '#16a34a' }: Props) {
  const [show, setShow] = useState(false)
  const [step, setStep] = useState<'questions' | 'rating' | 'done'>('questions')
  const [answers, setAnswers] = useState<{ q1?: boolean; q2?: boolean; q3?: boolean }>({})
  const [stars, setStars] = useState(0)
  const [hoverStar, setHoverStar] = useState(0)
  const [comment, setComment] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const role = getRole() || 'owner'
  const isOwner = ['owner', 'admin'].includes(role)
  const questions = isOwner ? OWNER_QUESTIONS : EMPLOYEE_QUESTIONS

  useEffect(() => {
    const t = setTimeout(() => {
      if (shouldShowFeedback(tenantId)) setShow(true)
    }, 2000)
    return () => clearTimeout(t)
  }, [tenantId])

  function dismiss() {
    localStorage.setItem(LAST_FEEDBACK_KEY(tenantId), String(Date.now()))
    setShow(false)
  }

  async function submit() {
    if (stars === 0) { setError('Please select a star rating.'); return }
    setLoading(true); setError('')
    try {
      await api.feedback.submit({
        q1: answers.q1,
        q2: answers.q2,
        q3: answers.q3,
        star_rating: stars,
        comment: comment.trim() || undefined,
        owner_name: ownerName.trim() || undefined,
        user_role: role,
      })
      localStorage.setItem(LAST_FEEDBACK_KEY(tenantId), String(Date.now()))
      setStep('done')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Submission failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!show) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)' }}>

        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between" style={{ background: `linear-gradient(135deg,${accentColor}33,rgba(99,102,241,0.2))`, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div>
            <p className="text-white font-bold text-base">Quick Feedback</p>
            <p className="text-slate-400 text-xs mt-0.5">
              {isOwner ? 'Share your experience as a restaurant owner' : 'How are the tools working for your day?'}
            </p>
          </div>
          <button onClick={dismiss} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        <div className="px-6 py-5">
          {step === 'done' ? (
            <div className="text-center py-6 space-y-3">
              <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center" style={{ background: 'rgba(22,163,74,0.15)', border: '1px solid rgba(22,163,74,0.3)' }}>
                <svg className="w-7 h-7 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
              </div>
              <p className="text-white font-bold text-lg">Thank you!</p>
              <p className="text-slate-400 text-sm">Your feedback has been submitted.</p>
              <p className="text-slate-500 text-xs mt-2 leading-relaxed">
                If you have further input on how the portal and its tools can be more simple, efficient, and effective for you — share it with the{' '}
                <span className="text-green-400 font-medium">AI Chat Assistant</span> at any time.
              </p>
              <button onClick={() => setShow(false)}
                className="mt-2 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-opacity hover:opacity-90"
                style={{ background: `linear-gradient(135deg,${accentColor},#22c55e)` }}>
                Close
              </button>
            </div>
          ) : step === 'questions' ? (
            <div className="space-y-5">
              {questions.map(q => (
                <div key={q.key}>
                  <p className="text-white text-sm font-medium mb-2.5">{q.label}</p>
                  <div className="flex gap-3">
                    {[{ val: true, label: 'Yes' }, { val: false, label: 'No' }].map(opt => (
                      <button
                        key={String(opt.val)}
                        onClick={() => setAnswers(a => ({ ...a, [q.key]: opt.val }))}
                        className="flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all"
                        style={answers[q.key as keyof typeof answers] === opt.val
                          ? { background: opt.val ? `${accentColor}22` : 'rgba(239,68,68,0.12)', borderColor: opt.val ? accentColor : '#ef4444', color: opt.val ? accentColor : '#f87171' }
                          : { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)', color: '#94a3b8' }
                        }
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <button onClick={() => setStep('rating')}
                className="w-full py-3 text-sm font-bold text-white rounded-xl transition-opacity hover:opacity-90 mt-2"
                style={{ background: `linear-gradient(135deg,${accentColor},#22c55e)` }}>
                Continue →
              </button>
              <button onClick={dismiss} className="w-full text-center text-xs text-slate-600 hover:text-slate-400 transition-colors">
                Skip for now
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Stars */}
              <div>
                <p className="text-white text-sm font-medium mb-3">Overall rating</p>
                <div className="flex gap-2 justify-center">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} onMouseEnter={() => setHoverStar(n)} onMouseLeave={() => setHoverStar(0)} onClick={() => setStars(n)}
                      className="text-3xl transition-transform hover:scale-110"
                      style={{ color: n <= (hoverStar || stars) ? '#f59e0b' : '#334155' }}>★</button>
                  ))}
                </div>
              </div>

              {/* Name */}
              <div>
                <p className="text-white text-sm font-medium mb-1.5">Your name <span className="text-slate-500 font-normal">(optional)</span></p>
                <input value={ownerName} onChange={e => setOwnerName(e.target.value)}
                  placeholder={isOwner ? `Owner at ${restaurantName}` : `Staff at ${restaurantName}`}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-slate-500" />
              </div>

              {/* Comment */}
              <div>
                <p className="text-white text-sm font-medium mb-1.5">Additional comments <span className="text-slate-500 font-normal">(optional)</span></p>
                <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3}
                  placeholder="Tell us more about your experience…"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-slate-500 resize-none" />
              </div>

              {error && <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

              <div className="flex gap-3">
                <button onClick={() => setStep('questions')} className="flex-1 text-slate-400 hover:text-white border border-slate-700 py-2.5 rounded-xl text-sm transition-colors">← Back</button>
                <button onClick={submit} disabled={loading}
                  className="flex-1 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-50 transition-opacity hover:opacity-90"
                  style={{ background: `linear-gradient(135deg,${accentColor},#22c55e)` }}>
                  {loading ? 'Submitting…' : 'Submit Feedback'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
