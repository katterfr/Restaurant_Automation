'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'

// ─── scroll-reveal hook ────────────────────────────────────────────────────────
function useInView(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.unobserve(el) } }, { threshold })
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return [ref, visible] as const
}

// ─── data ─────────────────────────────────────────────────────────────────────
const FEATURES = [
  { icon: '🤖', color: '#22c55e', cat: 'AI',        title: 'AI Phone Agent',        desc: 'AI answers every call 24/7, takes orders and submits them to your dashboard automatically.' },
  { icon: '🔄', color: '#22c55e', cat: 'AI',        title: 'Voice ↔ Text Bridge',   desc: 'Callers switch to SMS mid-call. Text customers switch to voice. AI handles both directions.' },
  { icon: '✨', color: '#818cf8', cat: 'AI',        title: 'AI Creative Studio',     desc: 'Generate professional ad images and videos in seconds. No designer needed.' },
  { icon: '🧠', color: '#818cf8', cat: 'AI',        title: 'AI Portal Assistant',   desc: 'Built-in chatbot inside your dashboard that knows your live stats and answers any question.' },
  { icon: '📣', color: '#f59e0b', cat: 'Marketing', title: 'Ad Campaign Manager',    desc: 'Run ads on Meta, Google, YouTube, TikTok, Snapchat, and Pinterest from one dashboard.' },
  { icon: '💬', color: '#f59e0b', cat: 'Marketing', title: 'Social Media Posting',  desc: 'Publish to Facebook, Instagram, YouTube, and TikTok simultaneously with one click.' },
  { icon: '📋', color: '#38bdf8', cat: 'Operations',title: 'Order Management',       desc: 'All orders — phone, delivery, online — appear in one unified real-time dashboard.' },
  { icon: '🍽️', color: '#38bdf8', cat: 'Operations',title: 'Menu Management',        desc: 'Digital menu with live availability toggles, pricing, categories and descriptions.' },
  { icon: '💰', color: '#38bdf8', cat: 'Operations',title: 'Accounting',             desc: 'Track revenue and expenses, view profit reports, and categorize entries automatically.' },
  { icon: '🚚', color: '#fb923c', cat: 'Presence',  title: 'Delivery Integrations', desc: 'Connect DoorDash, Uber Eats, and more. Orders flow straight into your dashboard.' },
  { icon: '📍', color: '#fb923c', cat: 'Presence',  title: 'Maps & Listings',        desc: 'Manage your Google Business Profile and Apple Maps listing from one place.' },
  { icon: '🎨', color: '#fb923c', cat: 'Presence',  title: 'Custom Branded Portal',  desc: 'Your own portal with custom colors, logo, welcome message and dark mode.' },
]

const PLATFORMS = ['Meta Ads','Google Ads','YouTube Ads','TikTok Ads','Snapchat Ads','Pinterest Ads',
  'Facebook','Instagram','YouTube','TikTok','DoorDash','Uber Eats','Google Maps','Apple Maps',
  'Meta Ads','Google Ads','YouTube Ads','TikTok Ads','Snapchat Ads','Pinterest Ads',
  'Facebook','Instagram','YouTube','TikTok','DoorDash','Uber Eats','Google Maps','Apple Maps']

const PLANS = [
  { id:'starter', name:'Starter', monthly:49, yearly:39, tag:'',         color:'rgba(30,41,59,0.8)',  border:'rgba(255,255,255,0.08)',
    features:['Order Management','Menu Management','Basic Reporting','Owner Portal','AI Chat Assistant'] },
  { id:'growth',  name:'Growth',  monthly:149,yearly:119,tag:'Most Popular',color:'rgba(15,23,42,0.9)',border:'rgba(34,197,94,0.5)',
    features:['Everything in Starter','6-Platform Ad Campaigns','Social Media Posting','Delivery Integrations','Google & Apple Maps Listings','AI Creative Studio'] },
  { id:'pro',     name:'Pro',     monthly:299,yearly:239,tag:'',         color:'rgba(30,41,59,0.8)',  border:'rgba(129,140,248,0.4)',
    features:['Everything in Growth','AI Phone Agent 24/7','Voice ↔ Text Bridge','Accounting & Bookkeeping','Priority Support','Custom Onboarding'] },
]

const TESTIMONIALS = [
  { quote: 'The AI phone agent alone paid for itself in the first week. We stopped missing after-hours orders completely.', name: 'Carlos M.', place: 'The Taqueria, Austin TX', stars: 5 },
  { quote: 'Managing ads across 5 platforms used to take hours every day. Now it\'s 10 minutes, and our ROAS doubled.', name: 'Sarah K.', place: 'Urban Bites, Chicago IL', stars: 5 },
  { quote: 'Our online presence exploded after connecting Google Maps and running AI-generated ad creatives. Revenue up 34%.', name: 'James T.', place: 'Harbor Grill, Miami FL', stars: 5 },
]

const STEPS = [
  { n:'01', icon:'📝', title:'Sign Up & Configure', time:'2 minutes', desc:'Create your account, enter your restaurant details, and choose your plan. Your portal is ready instantly.' },
  { n:'02', icon:'🔗', title:'Connect Your Platforms', time:'5 minutes', desc:'Link your ad accounts, social media pages, and delivery platforms with one-click OAuth connections.' },
  { n:'03', icon:'🚀', title:'Start Automating', time:'Immediate', desc:'AI takes your calls, your ads run, orders flow in. Your dashboard updates in real time — you\'re live.' },
]

// ─── visitor chatbot ───────────────────────────────────────────────────────────
type ChatMsg = { role: 'user' | 'assistant'; content: string }

function VisitorChat() {
  const [open, setOpen]     = useState(false)
  const [msgs, setMsgs]     = useState<ChatMsg[]>([])
  const [input, setInput]   = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])
  useEffect(() => { if (open && msgs.length === 0) setMsgs([{ role: 'assistant', content: "Hey! 👋 I'm Alex, your guide to Careful-Server. Ask me anything about features, pricing, or how to get started!" }]) }, [open])
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 120) }, [open])

  async function send(text?: string) {
    const content = (text ?? input).trim(); if (!content || loading) return
    const next: ChatMsg[] = [...msgs, { role: 'user', content }]
    setMsgs(next); setInput(''); setLoading(true)
    try {
      const { reply } = await api.public.chat(next)
      setMsgs(p => [...p, { role: 'assistant', content: reply }])
    } catch { setMsgs(p => [...p, { role: 'assistant', content: "Sorry! Please use the contact form and we'll reply within 24 hours." }]) }
    finally { setLoading(false) }
  }

  const QUICK = ['What does Careful-Server do?','Tell me about AI Phone Agent','What are the pricing plans?','How do I get started?']

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="w-80 sm:w-96 rounded-2xl overflow-hidden shadow-2xl flex flex-col" style={{ height: 480, background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)' }}>
          {/* header */}
          <div className="px-4 py-3 flex items-center gap-2.5 shrink-0" style={{ background: 'linear-gradient(135deg,#16a34a,#6366f1)' }}>
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm shrink-0">A</div>
            <div className="flex-1">
              <p className="text-white text-sm font-semibold leading-none">Alex</p>
              <p className="text-white/70 text-xs mt-0.5">Careful-Server Assistant</p>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white text-lg leading-none">✕</button>
          </div>
          {/* messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${m.role === 'user' ? 'text-white rounded-br-sm' : 'bg-slate-800 text-slate-100 rounded-bl-sm'}`}
                  style={m.role === 'user' ? { background: 'linear-gradient(135deg,#16a34a,#6366f1)' } : {}}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && <div className="flex justify-start"><div className="bg-slate-800 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1">{[0,150,300].map(d => <span key={d} className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay:`${d}ms` }}/>)}</div></div>}
            {msgs.length === 1 && !loading && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {QUICK.map(q => <button key={q} onClick={() => send(q)} className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 px-2.5 py-1 rounded-full transition-colors">{q}</button>)}
              </div>
            )}
            <div ref={bottomRef}/>
          </div>
          {/* input */}
          <div className="px-3 pb-3 pt-2 border-t border-slate-800 shrink-0">
            <div className="flex gap-2">
              <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
                placeholder="Ask anything…" disabled={loading}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-slate-500"/>
              <button onClick={() => send()} disabled={!input.trim()||loading}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-white disabled:opacity-30 shrink-0"
                style={{ background:'linear-gradient(135deg,#16a34a,#6366f1)' }}>
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 rotate-90"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* bubble */}
      <button onClick={() => setOpen(o => !o)}
        className="w-14 h-14 rounded-full text-white shadow-2xl flex items-center justify-center text-2xl transition-transform hover:scale-110 cs-glow"
        style={{ background:'linear-gradient(135deg,#16a34a,#6366f1)' }}
        title="Chat with us">
        {open ? '✕' : '💬'}
      </button>
    </div>
  )
}

// ─── signup modal ─────────────────────────────────────────────────────────────
function SignupModal({ onClose }: { onClose: () => void }) {
  const [step, setStep]     = useState(0)
  const [plan, setPlan]     = useState('growth')
  const [form, setForm]     = useState({ restaurant_name:'', city:'', phone:'', owner_email:'', owner_password:'', confirm:'' })
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')
  const [done, setDone]     = useState<{ slug: string; portal_url: string } | null>(null)

  function f(k: keyof typeof form) { return (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, [k]: e.target.value })) }

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
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative w-full max-w-md rounded-2xl overflow-hidden shadow-2xl" style={{ background:'#0f172a', border:'1px solid rgba(255,255,255,0.1)' }}>
        {/* header bar */}
        <div className="px-6 py-4 flex items-center justify-between" style={{ background:'linear-gradient(135deg,rgba(22,163,74,0.2),rgba(99,102,241,0.2))', borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-white font-semibold">Get Started Free</p>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        {done ? (
          <div className="px-6 py-8 text-center space-y-4">
            <div className="text-5xl">🎉</div>
            <p className="text-white text-lg font-bold">You're all set, {form.restaurant_name}!</p>
            <p className="text-slate-400 text-sm">Your portal is ready. Bookmark your unique link:</p>
            <div className="bg-slate-800 rounded-xl px-4 py-3 font-mono text-green-400 text-sm break-all">{typeof window !== 'undefined' ? window.location.origin : ''}{done.portal_url}</div>
            <a href={done.portal_url} className="block w-full text-center text-white font-semibold py-3 rounded-xl transition-opacity hover:opacity-90" style={{ background:'linear-gradient(135deg,#16a34a,#22c55e)' }}>
              Go to My Portal →
            </a>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-5">
            {/* step dots */}
            <div className="flex gap-2 justify-center">
              {['Restaurant','Account','Plan'].map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${i === step ? 'bg-green-500 text-white' : i < step ? 'bg-green-900 text-green-400' : 'bg-slate-800 text-slate-500'}`}>{i < step ? '✓' : i+1}</div>
                  {i < 2 && <div className={`w-8 h-px ${i < step ? 'bg-green-500' : 'bg-slate-700'}`}/>}
                </div>
              ))}
            </div>

            {step === 0 && (
              <div className="space-y-3">
                <p className="text-slate-400 text-xs text-center">Tell us about your restaurant</p>
                <input className={inp} placeholder="Restaurant name *" value={form.restaurant_name} onChange={f('restaurant_name')} required/>
                <input className={inp} placeholder="City, State" value={form.city} onChange={f('city')}/>
                <input className={inp} placeholder="Phone number" value={form.phone} onChange={f('phone')} type="tel"/>
                <button onClick={() => { if (!form.restaurant_name.trim()) { setError('Enter your restaurant name'); return }; setError(''); setStep(1) }}
                  className="w-full text-white font-semibold py-3 rounded-xl transition-opacity hover:opacity-90" style={{ background:'linear-gradient(135deg,#16a34a,#22c55e)' }}>
                  Continue →
                </button>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-3">
                <p className="text-slate-400 text-xs text-center">Create your account credentials</p>
                <input className={inp} placeholder="Email address *" value={form.owner_email} onChange={f('owner_email')} type="email" required/>
                <input className={inp} placeholder="Password (8+ chars) *" value={form.owner_password} onChange={f('owner_password')} type="password" required/>
                <input className={inp} placeholder="Confirm password *" value={form.confirm} onChange={f('confirm')} type="password" required/>
                <div className="flex gap-3">
                  <button onClick={() => { setError(''); setStep(0) }} className="flex-1 text-slate-400 hover:text-white border border-slate-700 py-2.5 rounded-xl text-sm transition-colors">← Back</button>
                  <button onClick={() => { if (!form.owner_email||!form.owner_password) { setError('Fill in all fields'); return }; if (form.owner_password!==form.confirm) { setError("Passwords don't match"); return }; setError(''); setStep(2) }}
                    className="flex-1 text-white font-semibold py-2.5 rounded-xl transition-opacity hover:opacity-90" style={{ background:'linear-gradient(135deg,#16a34a,#22c55e)' }}>
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
                    className={`w-full text-left rounded-xl p-3.5 border transition-all ${plan===p.id ? 'border-green-500 bg-green-500/10' : 'border-slate-700 hover:border-slate-600'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${plan===p.id ? 'border-green-500' : 'border-slate-600'}`}>
                          {plan===p.id && <div className="w-2 h-2 rounded-full bg-green-500"/>}
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
                    className="flex-1 text-white font-semibold py-2.5 rounded-xl transition-opacity hover:opacity-90 disabled:opacity-50" style={{ background:'linear-gradient(135deg,#16a34a,#22c55e)' }}>
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

// ─── page ──────────────────────────────────────────────────────────────────────
export default function MarketingPage() {
  const [showSignup, setShowSignup] = useState(false)
  const [mobileNav,  setMobileNav]  = useState(false)
  const [scrolled,   setScrolled]   = useState(false)
  const [yearly,     setYearly]     = useState(false)
  const [contactForm, setContactForm] = useState({ name:'', email:'', restaurant_name:'', phone:'', plan_interest:'', message:'' })
  const [contactSent,  setContactSent]  = useState(false)
  const [contactLoading, setContactLoading] = useState(false)

  // section visibility
  const [statsRef,    statsVis]    = useInView()
  const [featRef,     featVis]     = useInView()
  const [aiRef,       aiVis]       = useInView()
  const [howRef,      howVis]      = useInView()
  const [priceRef,    priceVis]    = useInView()
  const [testRef,     testVis]     = useInView()
  const [contactRef,  contactVis]  = useInView()

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', fn)
    return () => window.removeEventListener('scroll', fn)
  }, [])

  async function sendContact(e: React.FormEvent) {
    e.preventDefault()
    setContactLoading(true)
    try {
      await api.public.contact(contactForm)
      setContactSent(true)
    } catch { /* best-effort */ }
    finally { setContactLoading(false) }
  }

  const navLinks = [
    { label:'Features', href:'#features' },
    { label:'AI Tools',  href:'#ai' },
    { label:'Pricing',  href:'#pricing' },
    { label:'Contact',  href:'#contact' },
  ]

  const inp = 'w-full bg-slate-800/60 border border-slate-700/70 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-green-500 transition-colors'

  return (
    <div className="min-h-screen text-white" style={{ background:'#020617' }}>
      {/* ── NAV ── */}
      <header className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${scrolled ? 'glass border-b border-white/5 shadow-xl' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <a href="#" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base shadow-lg" style={{ background:'linear-gradient(135deg,#16a34a,#22c55e)' }}>🍽️</div>
            <span className="font-bold text-lg text-white group-hover:text-green-400 transition-colors">Careful-Server</span>
          </a>

          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map(n => (
              <a key={n.href} href={n.href} className="px-4 py-2 text-sm text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all">{n.label}</a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <Link href="/portal/login" className="text-sm text-slate-400 hover:text-white transition-colors px-3 py-2">Restaurant Login</Link>
            <Link href="/login" className="text-sm text-slate-400 hover:text-white transition-colors px-3 py-2">Admin</Link>
            <button onClick={() => setShowSignup(true)}
              className="text-sm font-semibold text-white px-5 py-2.5 rounded-xl transition-all hover:opacity-90 hover:scale-105 shadow-lg"
              style={{ background:'linear-gradient(135deg,#16a34a,#22c55e)' }}>
              Get Started Free
            </button>
          </div>

          <button className="md:hidden text-slate-400 hover:text-white p-2" onClick={() => setMobileNav(o => !o)}>
            {mobileNav ? '✕' : '☰'}
          </button>
        </div>

        {mobileNav && (
          <div className="md:hidden glass border-t border-white/5 px-4 pb-4 space-y-1">
            {navLinks.map(n => <a key={n.href} href={n.href} onClick={() => setMobileNav(false)} className="block px-4 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-white/5 rounded-lg">{n.label}</a>)}
            <div className="pt-2 flex flex-col gap-2">
              <Link href="/portal/login" className="block text-center text-sm text-slate-400 border border-slate-700 py-2.5 rounded-xl">Restaurant Login</Link>
              <button onClick={() => { setMobileNav(false); setShowSignup(true) }} className="text-sm font-semibold text-white py-2.5 rounded-xl" style={{ background:'linear-gradient(135deg,#16a34a,#22c55e)' }}>Get Started Free</button>
            </div>
          </div>
        )}
      </header>

      {/* ── HERO ── */}
      <section className="relative hero-bg dot-grid min-h-screen flex flex-col items-center justify-center text-center px-4 overflow-hidden pt-20">
        {/* orbs */}
        <div className="absolute top-1/4 left-1/5 w-96 h-96 rounded-full cs-float" style={{ background:'radial-gradient(circle,rgba(22,163,74,0.14) 0%,transparent 70%)', filter:'blur(40px)', pointerEvents:'none' }}/>
        <div className="absolute bottom-1/4 right-1/5 w-80 h-80 rounded-full cs-float-delay" style={{ background:'radial-gradient(circle,rgba(99,102,241,0.14) 0%,transparent 70%)', filter:'blur(40px)', pointerEvents:'none' }}/>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full cs-float-slow" style={{ background:'radial-gradient(circle,rgba(22,163,74,0.05) 0%,transparent 70%)', filter:'blur(60px)', pointerEvents:'none' }}/>

        <div className="relative z-10 max-w-5xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 glass-card px-4 py-2 rounded-full text-sm text-slate-300 cs-up mb-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"/>
            AI-powered restaurant management is here
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-tight cs-up-1">
            Restaurant Management,<br/>
            <span className="cs-grad-text">Reimagined with AI</span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto cs-up-2">
            The all-in-one platform that automates your phone orders, runs your ads across 6 platforms, generates AI creative, and manages every part of your restaurant — all from one dashboard.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center cs-up-3">
            <button onClick={() => setShowSignup(true)}
              className="px-8 py-4 text-base font-bold text-white rounded-2xl shadow-2xl transition-all hover:opacity-90 hover:scale-105 cs-glow"
              style={{ background:'linear-gradient(135deg,#16a34a,#22c55e)' }}>
              Start Free Trial →
            </button>
            <a href="#features" className="px-8 py-4 text-base font-semibold text-white rounded-2xl border border-white/10 hover:bg-white/5 transition-all">
              See All Features ↓
            </a>
          </div>

          {/* badge row */}
          <div className="flex flex-wrap justify-center gap-2 pt-2 cs-up-4">
            {['🤖 AI Phone Agent','📣 6 Ad Platforms','24/7 Orders','✨ AI Creative','🎯 Social Media','📍 Maps Listings'].map(b => (
              <span key={b} className="glass-card px-3.5 py-1.5 rounded-full text-xs text-slate-300">{b}</span>
            ))}
          </div>
        </div>

        {/* floating dashboard preview */}
        <div className="relative z-10 mt-16 max-w-4xl mx-auto w-full cs-float-slow">
          <div className="rounded-2xl overflow-hidden shadow-2xl" style={{ background:'#0f172a', border:'1px solid rgba(255,255,255,0.08)' }}>
            {/* fake window chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5" style={{ background:'rgba(30,41,59,0.8)' }}>
              <div className="w-3 h-3 rounded-full bg-red-500/70"/>
              <div className="w-3 h-3 rounded-full bg-yellow-500/70"/>
              <div className="w-3 h-3 rounded-full bg-green-500/70"/>
              <div className="flex-1 mx-4 h-6 rounded-lg bg-slate-800 flex items-center px-3">
                <span className="text-xs text-slate-500">portal.careful-server.com/your-restaurant</span>
              </div>
            </div>
            {/* dashboard mockup */}
            <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[['📦','47','Orders Today'],['💰','$2,840','Revenue'],['📱','12','Active Ads'],['🤖','3','AI Calls']].map(([icon, val, label]) => (
                <div key={label} className="glass-card rounded-xl p-3.5">
                  <div className="text-xl mb-1">{icon}</div>
                  <div className="text-lg font-bold text-white">{val}</div>
                  <div className="text-xs text-slate-500">{label}</div>
                </div>
              ))}
            </div>
            <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[['Meta Ads','Connected ✓','#1877f2'],['Google Ads','Connected ✓','#ea4335'],['AI Agent','Active ✓','#16a34a']].map(([p,s,c]) => (
                <div key={p} className="glass-card rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="text-sm text-slate-300">{p}</span>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ color:c, background:`${c}20` }}>{s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* scroll arrow */}
        <a href="#stats" className="absolute bottom-8 left-1/2 -translate-x-1/2 text-slate-500 hover:text-slate-300 transition-colors animate-bounce">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
        </a>
      </section>

      {/* ── STATS ── */}
      <section id="stats" className="py-16 border-y border-white/5" style={{ background:'rgba(15,23,42,0.8)' }}>
        <div ref={statsRef as React.RefObject<HTMLDivElement>} className={`max-w-5xl mx-auto px-4 grid grid-cols-2 sm:grid-cols-4 gap-8 text-center transition-all duration-700 ${statsVis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          {[['500+','Restaurants'],['1M+','Orders Handled'],['6','Ad Platforms'],['24/7','AI Coverage']].map(([v, l]) => (
            <div key={l}>
              <p className="text-4xl sm:text-5xl font-extrabold cs-grad-text">{v}</p>
              <p className="text-slate-400 text-sm mt-1">{l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="py-24 px-4">
        <div ref={featRef as React.RefObject<HTMLDivElement>} className={`max-w-7xl mx-auto transition-all duration-700 ${featVis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="text-center mb-14">
            <span className="text-green-400 text-sm font-semibold tracking-widest uppercase">Everything You Need</span>
            <h2 className="text-4xl sm:text-5xl font-extrabold text-white mt-3">Your Restaurant's Command Center</h2>
            <p className="text-slate-400 mt-4 max-w-2xl mx-auto">From AI-powered phone ordering to multi-platform advertising — every tool you need, in one dashboard. No switching between 10 different apps.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {FEATURES.map((f, i) => (
              <div key={f.title} className="feature-card glass-card rounded-2xl p-5 cursor-default" style={{ animationDelay:`${i*0.05}s` }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-3" style={{ background:`${f.color}18` }}>
                  {f.icon}
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full mb-2 inline-block" style={{ color:f.color, background:`${f.color}15` }}>{f.cat}</span>
                <h3 className="text-white font-semibold text-sm mt-1.5">{f.title}</h3>
                <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AI SPOTLIGHT ── */}
      <section id="ai" className="py-24 px-4 relative overflow-hidden" style={{ background:'rgba(15,23,42,0.6)' }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background:'radial-gradient(ellipse 60% 80% at 10% 50%, rgba(22,163,74,0.08) 0%, transparent 70%)' }}/>
        <div ref={aiRef as React.RefObject<HTMLDivElement>} className={`max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center transition-all duration-700 ${aiVis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="space-y-6">
            <span className="text-green-400 text-sm font-semibold tracking-widest uppercase">AI-Powered Core</span>
            <h2 className="text-4xl font-extrabold text-white">AI Built Into Every Layer</h2>
            <p className="text-slate-400">Careful-Server isn't just software with an AI bolt-on. AI is at the core of every workflow — from the moment a customer calls to the ad creative that brings them back.</p>
            <div className="space-y-4">
              {[
                { icon:'📞', title:'Always-On Phone Agent', desc:'Never miss an order. AI answers calls instantly, guides customers through your menu, and submits orders automatically — even at 2 AM.' },
                { icon:'🎨', title:'AI Ad Creative Generation', desc:'Describe your promotion and get professional-quality images and videos in seconds. No design budget needed.' },
                { icon:'🔄', title:'Voice ↔ Text Handoff', desc:'A customer can say "text me instead" and seamlessly continue ordering via SMS. Or text "CALL ME" and AI calls them back. ' },
              ].map(a => (
                <div key={a.title} className="flex gap-4 glass-card rounded-xl p-4">
                  <span className="text-2xl shrink-0">{a.icon}</span>
                  <div>
                    <p className="text-white font-semibold text-sm">{a.title}</p>
                    <p className="text-slate-400 text-xs mt-1 leading-relaxed">{a.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* animated visual */}
          <div className="relative">
            <div className="glass-card rounded-2xl p-6 space-y-3 cs-float">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-3 h-3 rounded-full bg-green-400 animate-pulse"/>
                <span className="text-green-400 text-sm font-semibold">AI Phone Agent — Live</span>
              </div>
              {[
                { from:'📞 Customer', msg:'Hi, I\'d like to order a large pepperoni pizza and two Cokes.', align:'left' },
                { from:'🤖 AI Agent', msg:'Great choice! That\'s $24.50. Can I get your name for the order?', align:'right' },
                { from:'📞 Customer', msg:'Actually, can you text me the confirmation?', align:'left' },
                { from:'🤖 AI Agent', msg:'Sure! Switching you to SMS now. Order #847 has been submitted to the kitchen ✅', align:'right' },
              ].map((m, i) => (
                <div key={i} className={`flex ${m.align === 'right' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${m.align === 'right' ? 'text-white rounded-br-sm' : 'bg-slate-700 text-slate-200 rounded-bl-sm'}`}
                    style={m.align === 'right' ? { background:'linear-gradient(135deg,#16a34a,#22c55e)' } : {}}>
                    <p className="text-[10px] opacity-60 mb-0.5">{m.from}</p>
                    {m.msg}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── PLATFORM TICKER ── */}
      <section className="py-10 border-y border-white/5 overflow-hidden" style={{ background:'rgba(2,6,23,0.8)' }}>
        <p className="text-center text-xs text-slate-600 uppercase tracking-widest mb-6">Integrates With Every Platform You Use</p>
        <div className="flex cs-tick whitespace-nowrap gap-0">
          {PLATFORMS.map((p, i) => (
            <span key={i} className="inline-flex items-center gap-2 mx-6 text-slate-400 text-sm font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500/50"/>
              {p}
            </span>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-24 px-4">
        <div ref={howRef as React.RefObject<HTMLDivElement>} className={`max-w-5xl mx-auto transition-all duration-700 ${howVis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="text-center mb-14">
            <span className="text-green-400 text-sm font-semibold tracking-widest uppercase">Simple Setup</span>
            <h2 className="text-4xl font-extrabold text-white mt-3">Up and Running in Minutes</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6 relative">
            {/* connecting line */}
            <div className="absolute top-12 left-1/6 right-1/6 h-px hidden md:block" style={{ background:'linear-gradient(90deg,rgba(22,163,74,0.4),rgba(99,102,241,0.4))' }}/>
            {STEPS.map((s, i) => (
              <div key={s.n} className="glass-card rounded-2xl p-6 text-center relative">
                <div className="w-12 h-12 rounded-2xl text-2xl flex items-center justify-center mx-auto mb-4" style={{ background:'linear-gradient(135deg,rgba(22,163,74,0.2),rgba(99,102,241,0.2))', border:'1px solid rgba(255,255,255,0.07)' }}>
                  {s.icon}
                </div>
                <div className="absolute top-4 right-4 text-2xl font-black text-white/5">{s.n}</div>
                <p className="text-xs text-green-400 font-semibold mb-1">{s.time}</p>
                <h3 className="text-white font-bold text-base mb-2">{s.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="py-24 px-4" style={{ background:'rgba(15,23,42,0.5)' }}>
        <div ref={priceRef as React.RefObject<HTMLDivElement>} className={`max-w-5xl mx-auto transition-all duration-700 ${priceVis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="text-center mb-12">
            <span className="text-green-400 text-sm font-semibold tracking-widest uppercase">Pricing</span>
            <h2 className="text-4xl font-extrabold text-white mt-3">Simple, Transparent Pricing</h2>
            <p className="text-slate-400 mt-3">Start free, scale as you grow. No hidden fees. Cancel anytime.</p>
            {/* toggle */}
            <div className="flex items-center justify-center gap-3 mt-6">
              <span className={`text-sm ${!yearly ? 'text-white' : 'text-slate-500'}`}>Monthly</span>
              <button onClick={() => setYearly(y => !y)} className={`w-12 h-6 rounded-full relative transition-colors ${yearly ? 'bg-green-500' : 'bg-slate-700'}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${yearly ? 'translate-x-6' : ''}`}/>
              </button>
              <span className={`text-sm ${yearly ? 'text-white' : 'text-slate-500'}`}>Yearly <span className="text-green-400 font-semibold">Save 20%</span></span>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-6 items-stretch">
            {PLANS.map(p => (
              <div key={p.id} className={`rounded-2xl p-6 flex flex-col relative transition-transform hover:-translate-y-1 duration-300 ${p.tag ? 'price-glow' : ''}`}
                style={{ background:p.color, border:`1px solid ${p.border}` }}>
                {p.tag && <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold text-white px-4 py-1 rounded-full" style={{ background:'linear-gradient(135deg,#16a34a,#22c55e)' }}>{p.tag}</div>}
                <div className="mb-5">
                  <h3 className="text-white font-bold text-lg">{p.name}</h3>
                  <div className="mt-2 flex items-end gap-1">
                    <span className="text-4xl font-extrabold text-white">${yearly ? p.yearly : p.monthly}</span>
                    <span className="text-slate-400 text-sm mb-1">/month</span>
                  </div>
                  {yearly && <p className="text-green-400 text-xs mt-0.5">Billed annually</p>}
                </div>
                <ul className="space-y-2.5 flex-1">
                  {p.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-300">
                      <span className="text-green-400 shrink-0 mt-0.5">✓</span>{f}
                    </li>
                  ))}
                </ul>
                <button onClick={() => setShowSignup(true)}
                  className={`mt-6 w-full py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90 hover:scale-105 ${p.tag ? 'text-white' : 'text-white border border-white/10 hover:bg-white/5'}`}
                  style={p.tag ? { background:'linear-gradient(135deg,#16a34a,#22c55e)' } : {}}>
                  Start with {p.name} →
                </button>
              </div>
            ))}
          </div>
          <p className="text-center text-slate-600 text-sm mt-8">All plans include a 14-day free trial · No credit card required</p>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="py-24 px-4">
        <div ref={testRef as React.RefObject<HTMLDivElement>} className={`max-w-5xl mx-auto transition-all duration-700 ${testVis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="text-center mb-12">
            <span className="text-green-400 text-sm font-semibold tracking-widest uppercase">Social Proof</span>
            <h2 className="text-4xl font-extrabold text-white mt-3">What Restaurant Owners Say</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map(t => (
              <div key={t.name} className="glass-card rounded-2xl p-6 space-y-4">
                <div className="flex gap-0.5">{Array.from({length:t.stars}).map((_,i) => <span key={i} className="text-yellow-400">★</span>)}</div>
                <p className="text-slate-300 text-sm leading-relaxed">"{t.quote}"</p>
                <div>
                  <p className="text-white font-semibold text-sm">{t.name}</p>
                  <p className="text-slate-500 text-xs">{t.place}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CONTACT ── */}
      <section id="contact" className="py-24 px-4" style={{ background:'rgba(15,23,42,0.5)' }}>
        <div ref={contactRef as React.RefObject<HTMLDivElement>} className={`max-w-5xl mx-auto transition-all duration-700 ${contactVis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="grid md:grid-cols-2 gap-12 items-start">
            <div className="space-y-6">
              <span className="text-green-400 text-sm font-semibold tracking-widest uppercase">Get In Touch</span>
              <h2 className="text-4xl font-extrabold text-white">Let's Talk About Your Restaurant</h2>
              <p className="text-slate-400">Have questions? Want a demo? Need a custom plan for multiple locations? Our team responds within 24 hours.</p>
              <div className="space-y-4">
                {[
                  { icon:'📧', title:'Email Us', sub:'hello@careful-server.com' },
                  { icon:'📞', title:'Call Us', sub:'+1 (800) CAREFUL' },
                  { icon:'⏱️', title:'Response Time', sub:'Within 24 hours guaranteed' },
                ].map(c => (
                  <div key={c.title} className="flex items-center gap-4 glass-card rounded-xl px-4 py-3">
                    <span className="text-xl">{c.icon}</span>
                    <div><p className="text-white text-sm font-medium">{c.title}</p><p className="text-slate-400 text-xs">{c.sub}</p></div>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-card rounded-2xl p-6">
              {contactSent ? (
                <div className="text-center py-8 space-y-3">
                  <div className="text-5xl">✅</div>
                  <p className="text-white font-bold text-lg">Message Sent!</p>
                  <p className="text-slate-400 text-sm">We'll get back to you within 24 hours.</p>
                </div>
              ) : (
                <form onSubmit={sendContact} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <input className={inp} placeholder="Your name *" value={contactForm.name} onChange={e => setContactForm(p=>({...p,name:e.target.value}))} required/>
                    <input className={inp} placeholder="Email *" type="email" value={contactForm.email} onChange={e => setContactForm(p=>({...p,email:e.target.value}))} required/>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input className={inp} placeholder="Restaurant name" value={contactForm.restaurant_name} onChange={e => setContactForm(p=>({...p,restaurant_name:e.target.value}))}/>
                    <input className={inp} placeholder="Phone" value={contactForm.phone} onChange={e => setContactForm(p=>({...p,phone:e.target.value}))}/>
                  </div>
                  <select className={inp} value={contactForm.plan_interest} onChange={e => setContactForm(p=>({...p,plan_interest:e.target.value}))}>
                    <option value="">Interested in… (optional)</option>
                    <option value="starter">Starter ($49/mo)</option>
                    <option value="growth">Growth ($149/mo)</option>
                    <option value="pro">Pro ($299/mo)</option>
                    <option value="enterprise">Enterprise / Custom</option>
                  </select>
                  <textarea className={`${inp} resize-none`} rows={4} placeholder="Your message *" value={contactForm.message} onChange={e => setContactForm(p=>({...p,message:e.target.value}))} required/>
                  <button type="submit" disabled={contactLoading}
                    className="w-full py-3 text-sm font-bold text-white rounded-xl transition-all hover:opacity-90 disabled:opacity-50"
                    style={{ background:'linear-gradient(135deg,#16a34a,#22c55e)' }}>
                    {contactLoading ? 'Sending…' : 'Send Message →'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center glass-card rounded-3xl p-12 space-y-6" style={{ background:'rgba(22,163,74,0.06)', border:'1px solid rgba(22,163,74,0.2)' }}>
          <h2 className="text-4xl sm:text-5xl font-extrabold text-white">Ready to Transform Your Restaurant?</h2>
          <p className="text-slate-400 text-lg max-w-xl mx-auto">Join hundreds of restaurants already saving time, reducing missed calls, and growing revenue with Careful-Server.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button onClick={() => setShowSignup(true)}
              className="px-10 py-4 text-base font-bold text-white rounded-2xl shadow-2xl transition-all hover:opacity-90 hover:scale-105 cs-glow"
              style={{ background:'linear-gradient(135deg,#16a34a,#22c55e)' }}>
              Start Free Trial — No Card Needed
            </button>
            <a href="#contact" className="px-8 py-4 text-base font-semibold text-slate-300 hover:text-white rounded-2xl border border-white/10 hover:bg-white/5 transition-all">
              Talk to Sales
            </a>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-white/5 py-12 px-4" style={{ background:'rgba(2,6,23,0.9)' }}>
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-10">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm" style={{ background:'linear-gradient(135deg,#16a34a,#22c55e)' }}>🍽️</div>
                <span className="font-bold text-white">Careful-Server</span>
              </div>
              <p className="text-slate-500 text-sm">The AI-powered restaurant management platform built for the modern operator.</p>
            </div>
            {[
              { heading:'Product', links:[['Features','#features'],['AI Tools','#ai'],['Pricing','#pricing'],['Integrations','#features']] },
              { heading:'Company',  links:[['Contact','#contact'],['Restaurant Login','/portal/login'],['Admin Login','/login'],['Dashboard','/dashboard']] },
              { heading:'Support',  links:[['Documentation','#'],['Status','#'],['Privacy Policy','#'],['Terms of Service','#']] },
            ].map(col => (
              <div key={col.heading}>
                <p className="text-white font-semibold text-sm mb-3">{col.heading}</p>
                <ul className="space-y-2">
                  {col.links.map(([label, href]) => (
                    <li key={label}><a href={href} className="text-slate-500 hover:text-slate-300 text-sm transition-colors">{label}</a></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-white/5 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-slate-600 text-sm">© {new Date().getFullYear()} Careful-Server. All rights reserved.</p>
            <p className="text-slate-600 text-sm">Built for restaurants, powered by AI.</p>
          </div>
        </div>
      </footer>

      {/* ── MODALS & CHATBOT ── */}
      {showSignup && <SignupModal onClose={() => setShowSignup(false)}/>}
      <VisitorChat/>
    </div>
  )
}
