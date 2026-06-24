'use client'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'

interface Props {
  tenantId: number
  restaurantName: string
  accentColor?: string
}

const STORAGE_KEY = (id: number) => `cs_feedback_done_${id}`

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

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY(tenantId))
    if (done) return
    const t = setTimeout(() => setShow(true), 8000)
    return () => clearTimeout(t)
  }, [tenantId])

  function dismiss() {
    localStorage.setItem(STORAGE_KEY(tenantId), 'dismissed')
    setShow(false)
  }

  async function submit() {
    if (stars === 0) { setError('Please select a star rating.'); return }
    setLoading(true); setError('')
    try {
      await api.feedback.submit({
        q1_overall: answers.q1,
        q2_easy_to_use: answers.q2,
        q3_effective: answers.q3,
        star_rating: stars,
        comment: comment.trim() || undefined,
        owner_name: ownerName.trim() || undefined,
      })
      localStorage.setItem(STORAGE_KEY(tenantId), 'submitted')
      setStep('done')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Submission failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!show) return null

  const questions = [
    { key: 'q1' as const, label: 'Are you satisfied with Careful Server overall?' },
    { key: 'q2' as const, label: 'Is the platform easy to use?' },
    { key: 'q3' as const, label: 'Has it been effective for your business?' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)' }}>

        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between" style={{ background: `linear-gradient(135deg,${accentColor}33,rgba(99,102,241,0.2))`, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div>
            <p className="text-white font-bold text-base">How's it going? 🌟</p>
            <p className="text-slate-400 text-xs mt-0.5">Share your experience with Careful Server</p>
          </div>
          <button onClick={dismiss} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        <div className="px-6 py-5">

          {step === 'done' ? (
            <div className="text-center py-6 space-y-3">
              <div className="text-5xl">🎉</div>
              <p className="text-white font-bold text-lg">Thank you!</p>
              <p className="text-slate-400 text-sm">Your feedback has been submitted.</p>
              <button onClick={() => setShow(false)}
                className="mt-2 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-opacity hover:opacity-90"
                style={{ background: `linear-gradient(135deg,${accentColor},#22c55e)` }}>
                Close
              </button>
            </div>
          ) : step === 'questions' ? (
            <div className="space-y-5">
              {/* 3 Yes/No questions */}
              {questions.map(q => (
                <div key={q.key}>
                  <p className="text-white text-sm font-medium mb-2.5">{q.label}</p>
                  <div className="flex gap-3">
                    {[{ val: true, label: 'Yes ✓' }, { val: false, label: 'No ✗' }].map(opt => (
                      <button
                        key={String(opt.val)}
                        onClick={() => setAnswers(a => ({ ...a, [q.key]: opt.val }))}
                        className="flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all"
                        style={answers[q.key] === opt.val
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

              <button
                onClick={() => setStep('rating')}
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
              {/* Star rating */}
              <div>
                <p className="text-white text-sm font-medium mb-3">Overall rating</p>
                <div className="flex gap-2 justify-center">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      onMouseEnter={() => setHoverStar(n)}
                      onMouseLeave={() => setHoverStar(0)}
                      onClick={() => setStars(n)}
                      className="text-3xl transition-transform hover:scale-110"
                      style={{ color: n <= (hoverStar || stars) ? '#f59e0b' : '#334155' }}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>

              {/* Your name */}
              <div>
                <p className="text-white text-sm font-medium mb-1.5">Your name <span className="text-slate-500 font-normal">(optional)</span></p>
                <input
                  value={ownerName}
                  onChange={e => setOwnerName(e.target.value)}
                  placeholder={`Owner at ${restaurantName}`}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-slate-500"
                />
              </div>

              {/* Comment */}
              <div>
                <p className="text-white text-sm font-medium mb-1.5">Additional comments <span className="text-slate-500 font-normal">(optional)</span></p>
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  rows={3}
                  placeholder="Tell us more about your experience…"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-slate-500 resize-none"
                />
              </div>

              {error && <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

              <div className="flex gap-3">
                <button onClick={() => setStep('questions')} className="flex-1 text-slate-400 hover:text-white border border-slate-700 py-2.5 rounded-xl text-sm transition-colors">← Back</button>
                <button
                  onClick={submit}
                  disabled={loading}
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
