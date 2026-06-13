'use client'
import { useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'

const PLANS = [
  { id: 'starter', name: 'Starter',  monthly: 49,  tag: '' },
  { id: 'growth',  name: 'Growth',   monthly: 149, tag: 'Most Popular' },
  { id: 'pro',     name: 'Pro',      monthly: 299, tag: '' },
]

export default function SignupPage() {
  const [step, setStep]     = useState(0)
  const [plan, setPlan]     = useState('growth')
  const [form, setForm]     = useState({ restaurant_name: '', city: '', phone: '', owner_email: '', owner_password: '', confirm: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')
  const [done, setDone]     = useState<{ slug: string; portal_url: string } | null>(null)

  function f(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, [k]: e.target.value }))
  }

  async function submit() {
    if (form.owner_password !== form.confirm) { setError("Passwords don't match"); return }
    if (form.owner_password.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true); setError('')
    try {
      const res = await api.public.signup({ restaurant_name: form.restaurant_name, owner_email: form.owner_email, owner_password: form.owner_password, phone: form.phone, city: form.city, plan })
      setDone(res)
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Signup failed') }
    finally { setLoading(false) }
  }

  const inp = 'w-full bg-slate-800/60 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-green-500 transition-colors'

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: 'radial-gradient(ellipse at top,#0f2318 0%,#0a0a0f 60%)' }}>

      {/* Logo + back link */}
      <div className="w-full max-w-md flex items-center justify-between mb-6">
        <Link href="/" className="flex items-center gap-2">
          <img src="/logo.jpg" alt="Careful-Server" className="w-8 h-8 rounded-xl object-cover" />
          <span className="text-white text-sm font-semibold">Careful-Server</span>
        </Link>
        <Link href="/portal/login" className="text-slate-400 hover:text-white text-xs transition-colors">
          Already have an account? Sign in →
        </Link>
      </div>

      {/* Card */}
      <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl" style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)' }}>

        {/* Header */}
        <div className="px-6 py-4" style={{ background: 'linear-gradient(135deg,rgba(22,163,74,0.2),rgba(99,102,241,0.2))', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-white font-semibold">Get Started Free</p>
          <p className="text-slate-400 text-xs mt-0.5">No credit card required · Cancel anytime</p>
        </div>

        {done ? (
          <div className="px-6 py-8 text-center space-y-4">
            <div className="text-5xl">🎉</div>
            <p className="text-white text-lg font-bold">You're all set, {form.restaurant_name}!</p>
            <p className="text-slate-400 text-sm">Your portal is ready. Bookmark your unique link:</p>
            <div className="bg-slate-800 rounded-xl px-4 py-3 font-mono text-green-400 text-sm break-all">
              {typeof window !== 'undefined' ? window.location.origin : ''}{done.portal_url}
            </div>
            <a href={done.portal_url} className="block w-full text-center text-white font-semibold py-3 rounded-xl transition-opacity hover:opacity-90" style={{ background: 'linear-gradient(135deg,#16a34a,#22c55e)' }}>
              Go to My Portal →
            </a>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-5">
            {/* Step indicators */}
            <div className="flex gap-2 justify-center">
              {['Restaurant', 'Account', 'Plan'].map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${i === step ? 'bg-green-500 text-white' : i < step ? 'bg-green-900 text-green-400' : 'bg-slate-800 text-slate-500'}`}>
                    {i < step ? '✓' : i + 1}
                  </div>
                  {i < 2 && <div className={`w-8 h-px ${i < step ? 'bg-green-500' : 'bg-slate-700'}`} />}
                </div>
              ))}
            </div>

            {step === 0 && (
              <div className="space-y-3">
                <p className="text-slate-400 text-xs text-center">Tell us about your restaurant</p>
                <input className={inp} placeholder="Restaurant name *" value={form.restaurant_name} onChange={f('restaurant_name')} required />
                <input className={inp} placeholder="City, State" value={form.city} onChange={f('city')} />
                <input className={inp} placeholder="Phone number" value={form.phone} onChange={f('phone')} type="tel" />
                <button
                  onClick={() => { if (!form.restaurant_name.trim()) { setError('Enter your restaurant name'); return }; setError(''); setStep(1) }}
                  className="w-full text-white font-semibold py-3 rounded-xl transition-opacity hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg,#16a34a,#22c55e)' }}>
                  Continue →
                </button>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-3">
                <p className="text-slate-400 text-xs text-center">Create your account credentials</p>
                <input className={inp} placeholder="Email address *" value={form.owner_email} onChange={f('owner_email')} type="email" required />
                <input className={inp} placeholder="Password (8+ chars) *" value={form.owner_password} onChange={f('owner_password')} type="password" required />
                <input className={inp} placeholder="Confirm password *" value={form.confirm} onChange={f('confirm')} type="password" required />
                <div className="flex gap-3">
                  <button onClick={() => { setError(''); setStep(0) }} className="flex-1 text-slate-400 hover:text-white border border-slate-700 py-2.5 rounded-xl text-sm transition-colors">← Back</button>
                  <button
                    onClick={() => { if (!form.owner_email || !form.owner_password) { setError('Fill in all fields'); return }; if (form.owner_password !== form.confirm) { setError("Passwords don't match"); return }; setError(''); setStep(2) }}
                    className="flex-1 text-white font-semibold py-2.5 rounded-xl transition-opacity hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg,#16a34a,#22c55e)' }}>
                    Continue →
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <p className="text-slate-400 text-xs text-center">Choose your plan — upgrade or downgrade anytime</p>
                {PLANS.map(p => (
                  <button key={p.id} onClick={() => setPlan(p.id)}
                    className={`w-full text-left rounded-xl p-3.5 border transition-all ${plan === p.id ? 'border-green-500 bg-green-500/10' : 'border-slate-700 hover:border-slate-600'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${plan === p.id ? 'border-green-500' : 'border-slate-600'}`}>
                          {plan === p.id && <div className="w-2 h-2 rounded-full bg-green-500" />}
                        </div>
                        <span className="text-white text-sm font-semibold">{p.name}</span>
                        {p.tag && <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">{p.tag}</span>}
                      </div>
                      <span className="text-white text-sm font-bold">${p.monthly}<span className="text-slate-500 font-normal text-xs">/mo</span></span>
                    </div>
                  </button>
                ))}
                <div className="flex gap-3 pt-1">
                  <button onClick={() => { setError(''); setStep(1) }} className="flex-1 text-slate-400 hover:text-white border border-slate-700 py-2.5 rounded-xl text-sm transition-colors">← Back</button>
                  <button onClick={submit} disabled={loading}
                    className="flex-1 text-white font-semibold py-2.5 rounded-xl transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg,#16a34a,#22c55e)' }}>
                    {loading ? 'Creating…' : '🚀 Create Account'}
                  </button>
                </div>
              </div>
            )}

            {error && <p className="text-red-400 text-sm text-center bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
            <p className="text-xs text-slate-600 text-center">No credit card required · Cancel anytime</p>
          </div>
        )}
      </div>
    </div>
  )
}
