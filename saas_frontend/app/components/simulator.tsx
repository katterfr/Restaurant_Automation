'use client'
import { useState, useEffect, useRef } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────
type Phase = 'idle' | 'setup1' | 'setup2' | 'manual' | 'transition' | 'auto' | 'results'

interface RestaurantType { id: string; label: string; icon: string; avg: number }
interface TeamSize       { id: string; label: string; desc: string; daily: number }
interface GameEvent {
  id: string
  type: 'call' | 'delivery' | 'online' | 'ad' | 'social'
  icon: string
  label: string
  detail: string
  value: number
  maxAge: number
  born: number
  handled: boolean
  missed: boolean
  autoHandled: boolean
}

// ── Static data ────────────────────────────────────────────────────────────────
const REST_TYPES: RestaurantType[] = [
  { id: 'qsr',    label: 'Quick Service',    icon: 'QSR', avg: 18 },
  { id: 'casual', label: 'Casual Dining',    icon: 'CDR', avg: 38 },
  { id: 'pizza',  label: 'Pizza & Delivery', icon: 'PZA', avg: 26 },
  { id: 'fine',   label: 'Fine Dining',      icon: 'FDR', avg: 90 },
]

const TEAM_SIZES: TeamSize[] = [
  { id: 'solo',  label: 'Solo / Family Run',  desc: '~40 orders/day',  daily: 40  },
  { id: 'small', label: 'Small Team (5–15)',   desc: '~120 orders/day', daily: 120 },
  { id: 'busy',  label: 'Busy Location (15+)', desc: '~300 orders/day', daily: 300 },
]

const TEMPLATES = [
  { type: 'call'     as const, icon: 'Call', ttl: 6000, rev: true,  labels: ['Incoming call: 2 burgers','Phone order: family meal','Call: takeout for 4','Order call: appetizers + mains'] },
  { type: 'delivery' as const, icon: 'Del',  ttl: 7500, rev: true,  labels: ['DoorDash order incoming','Uber Eats notification','Delivery: 3 items','Delivery: lunch special'] },
  { type: 'online'   as const, icon: 'Web',  ttl: 8000, rev: true,  labels: ['Website order: dinner for 2','New online order submitted','Pre-order: birthday party','Web order: large table'] },
  { type: 'ad'       as const, icon: 'Ads',  ttl: 6500, rev: false, labels: ['Ad budget needs review!','Campaign underperforming!','Ad opportunity: weekend rush','Competitor outbidding you!'] },
  { type: 'social'   as const, icon: 'Soc',  ttl: 9000, rev: false, labels: ['Daily special needs posting','FB + IG post ready to send','Customer review to respond','Social post: approve now?'] },
]

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }
function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2)}` }

function makeEvent(rt: RestaurantType): GameEvent {
  const tpl = pick(TEMPLATES)
  const rawVal = tpl.rev ? Math.round(rt.avg * (0.75 + Math.random() * 0.55)) : 0
  return {
    id: uid(), type: tpl.type, icon: tpl.icon,
    label: pick(tpl.labels),
    detail: rawVal > 0 ? `$${rawVal} order` : 'Action needed',
    value: rawVal,
    maxAge: tpl.ttl,
    born: Date.now(),
    handled: false, missed: false, autoHandled: false,
  }
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function Simulator({ onSignup }: { onSignup: () => void }) {
  const [phase, setPhase]           = useState<Phase>('idle')
  const [rt, setRt]                 = useState<RestaurantType | null>(null)
  const [ts, setTs]                 = useState<TeamSize | null>(null)
  const [events, setEvents]         = useState<GameEvent[]>([])
  const [mCap, setMCap]             = useState(0)   // manual captured $
  const [mMiss, setMMiss]           = useState(0)   // manual missed $
  const [aCap, setACap]             = useState(0)   // auto captured $
  const [combo, setCombo]           = useState(0)   // streak
  const [maxCombo, setMaxCombo]     = useState(0)
  const [stress, setStress]         = useState(0)   // 0–100
  const [mTimer, setMTimer]         = useState(50)
  const [aTimer, setATimer]         = useState(35)
  const [flash, setFlash]           = useState<string | null>(null)
  const [justMissed, setJustMissed] = useState(false)

  const phaseRef = useRef(phase)
  const rtRef    = useRef(rt)
  const comboRef = useRef(combo)
  phaseRef.current  = phase
  rtRef.current     = rt
  comboRef.current  = combo

  // ── helpers ──────────────────────────────────────────────────────────────────
  function showFlash(msg: string) { setFlash(msg); setTimeout(() => setFlash(null), 900) }

  function startSim(chosenTs: TeamSize) {
    setTs(chosenTs)
    setEvents([]); setMCap(0); setMMiss(0); setACap(0)
    setCombo(0); setMaxCombo(0); setStress(0)
    setMTimer(50); setATimer(35)
    setPhase('manual')
  }

  function reset() {
    setPhase('idle'); setRt(null); setTs(null); setEvents([])
    setMCap(0); setMMiss(0); setACap(0); setCombo(0); setStress(0)
  }

  // ── event spawner ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'manual' && phase !== 'auto') return
    const isAuto = phase === 'auto'
    const interval = setInterval(() => {
      if (phaseRef.current !== 'manual' && phaseRef.current !== 'auto') return
      const _rt = rtRef.current!
      const evt = makeEvent(_rt)

      if (isAuto) {
        // instantly auto-handle after brief flash
        setEvents(prev => [...prev.slice(-8), evt])
        setTimeout(() => {
          setEvents(prev => prev.map(e => e.id === evt.id ? { ...e, autoHandled: true, handled: true } : e))
          if (evt.value > 0) setACap(p => p + evt.value)
          setTimeout(() => setEvents(prev => prev.filter(e => e.id !== evt.id)), 700)
        }, 350 + Math.random() * 400)
      } else {
        setEvents(prev => [...prev.slice(-9), evt])
      }
    }, isAuto ? 600 : 1100)

    return () => clearInterval(interval)
  }, [phase])

  // ── expire events (manual) ────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'manual') return
    const interval = setInterval(() => {
      const now = Date.now()
      let missedRev = 0
      setEvents(prev => prev.map(e => {
        if (!e.handled && !e.missed && now - e.born > e.maxAge) {
          missedRev += e.value
          return { ...e, missed: true }
        }
        return e
      }))
      if (missedRev > 0) {
        setMMiss(m => m + missedRev)
        setStress(s => Math.min(100, s + 10))
        setCombo(0)
        setJustMissed(true)
        setTimeout(() => setJustMissed(false), 600)
        showFlash(`-$${missedRev} missed!`)
      }
      // clean up old missed after fade
      setTimeout(() => {
        setEvents(prev => prev.filter(e => !e.missed || Date.now() - e.born < e.maxAge + 1400))
      }, 1200)
    }, 400)
    return () => clearInterval(interval)
  }, [phase])

  // ── countdown timers ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase === 'manual') {
      const t = setInterval(() => {
        setMTimer(p => {
          if (p <= 1) {
            clearInterval(t)
            setPhase('transition')
            setTimeout(() => { setEvents([]); setPhase('auto') }, 3200)
            return 0
          }
          return p - 1
        })
      }, 1000)
      return () => clearInterval(t)
    }
    if (phase === 'auto') {
      const t = setInterval(() => {
        setATimer(p => {
          if (p <= 1) { clearInterval(t); setPhase('results'); return 0 }
          return p - 1
        })
      }, 1000)
      return () => clearInterval(t)
    }
  }, [phase])

  // ── handle tap ────────────────────────────────────────────────────────────────
  function tap(id: string) {
    setEvents(prev => prev.map(e => {
      if (e.id !== id || e.handled || e.missed) return e
      if (e.value > 0) {
        const bonus = comboRef.current >= 3 ? Math.round(e.value * 0.1) : 0
        setMCap(c => c + e.value + bonus)
        if (bonus) showFlash(`+$${e.value} 🔥 Combo x${comboRef.current + 1}!`)
        else showFlash(`+$${e.value} captured!`)
      } else {
        showFlash('✓ Handled!')
      }
      setCombo(c => { const nc = c + 1; setMaxCombo(m => Math.max(m, nc)); return nc })
      setStress(s => Math.max(0, s - 5))
      return { ...e, handled: true }
    }))
    setTimeout(() => setEvents(prev => prev.filter(e => e.id !== id)), 350)
  }

  // ── results math ─────────────────────────────────────────────────────────────
  const totalSeen  = mCap + mMiss
  const captureRate = totalSeen > 0 ? Math.round((mCap / totalSeen) * 100) : 0
  // Conservative extrapolation: sim runs 5× faster than reality; 4 peak hours/day; 26 days/month
  const monthlyExtra = Math.round(mMiss * 5 * 4 * 26)
  const planCost  = 149
  const roiMonths = monthlyExtra > planCost ? Math.round(planCost / monthlyExtra * 30) : 0

  // ─────────────────────────────────────────────────────────────────────────────
  // IDLE
  // ─────────────────────────────────────────────────────────────────────────────
  if (phase === 'idle') return (
    <div className="text-center space-y-6 py-6">
      <div className="inline-flex items-center gap-2 glass-card px-4 py-2 rounded-full text-sm text-slate-300">
        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"/>
        Interactive Demo · No signup needed · 90 seconds
      </div>
      <h3 className="text-3xl sm:text-4xl font-extrabold text-white">Run Your Restaurant.<br/><span className="cs-grad-text">See the Difference Live.</span></h3>
      <p className="text-slate-400 max-w-xl mx-auto text-base">
        Manage orders manually for 50 seconds — then watch AI take over for 35 seconds. We'll calculate exactly how much you're losing without Careful-Server.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-xl mx-auto">
        {[['Tap','Handle events in real time'],['Fast','Events expire quickly'],['ROI','Personalized revenue report'],['AI','Watch automation take over']].map(([i,t]) => (
          <div key={t} className="glass-card rounded-xl p-3 text-center">
            <div className="text-xs font-bold text-green-400 mb-1">{i}</div>
            <p className="text-slate-400 text-xs leading-tight">{t}</p>
          </div>
        ))}
      </div>

      <button onClick={() => setPhase('setup1')}
        className="px-10 py-4 text-base font-bold text-white rounded-2xl shadow-2xl transition-all hover:opacity-90 hover:scale-105 cs-glow"
        style={{ background: 'linear-gradient(135deg,#16a34a,#22c55e)' }}>
        Start Simulation →
      </button>
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // SETUP 1 — Restaurant type
  // ─────────────────────────────────────────────────────────────────────────────
  if (phase === 'setup1') return (
    <div className="max-w-lg mx-auto space-y-6 py-4">
      <div className="text-center">
        <p className="text-green-400 text-xs font-bold uppercase tracking-widest">Step 1 of 2</p>
        <h3 className="text-2xl font-extrabold text-white mt-2">What type of restaurant?</h3>
        <p className="text-slate-500 text-sm mt-1">We'll personalise your simulation and ROI report</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {REST_TYPES.map(r => (
          <button key={r.id} onClick={() => { setRt(r); setPhase('setup2') }}
            className="glass-card rounded-2xl p-5 text-left transition-all hover:border-green-500/40 hover:bg-green-500/5 hover:-translate-y-1 active:scale-95"
            style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="text-xs font-bold text-green-400 mb-2">{r.icon}</div>
            <p className="text-white font-bold">{r.label}</p>
            <p className="text-slate-500 text-xs mt-0.5">~${r.avg} avg order</p>
          </button>
        ))}
      </div>
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // SETUP 2 — Team size
  // ─────────────────────────────────────────────────────────────────────────────
  if (phase === 'setup2') return (
    <div className="max-w-lg mx-auto space-y-6 py-4">
      <div className="text-center">
        <p className="text-green-400 text-xs font-bold uppercase tracking-widest">Step 2 of 2</p>
        <h3 className="text-2xl font-extrabold text-white mt-2">How busy are you?</h3>
        <p className="text-slate-500 text-sm mt-1">{rt?.icon} {rt?.label} · ~${rt?.avg} avg order</p>
      </div>
      <div className="space-y-3">
        {TEAM_SIZES.map(s => (
          <button key={s.id} onClick={() => startSim(s)}
            className="w-full glass-card rounded-2xl p-4 flex items-center gap-4 transition-all hover:border-green-500/40 hover:bg-green-500/5 hover:-translate-y-0.5 active:scale-95">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xs font-bold text-green-400 shrink-0" style={{ background: 'rgba(22,163,74,0.12)' }}>
              {s.id === 'solo' ? 'Solo' : s.id === 'small' ? 'Sm' : 'Lg'}
            </div>
            <div className="flex-1 text-left">
              <p className="text-white font-bold">{s.label}</p>
              <p className="text-slate-500 text-sm">{s.desc}</p>
            </div>
            <span className="text-green-400 text-xl">→</span>
          </button>
        ))}
      </div>
      <button onClick={() => setPhase('setup1')} className="w-full text-center text-slate-600 hover:text-slate-400 text-sm transition-colors">← Change restaurant type</button>
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // TRANSITION
  // ─────────────────────────────────────────────────────────────────────────────
  if (phase === 'transition') return (
    <div className="text-center py-20 space-y-6">
      <div className="relative inline-block w-20 h-20 rounded-2xl flex items-center justify-center cs-float-slow" style={{ background: 'rgba(22,163,74,0.15)', border: '1px solid rgba(22,163,74,0.3)' }}>
        <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/></svg>
        <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-green-400 animate-ping"/>
      </div>
      <h3 className="text-3xl font-extrabold text-white">Activating Careful-Server AI…</h3>
      <p className="text-slate-400">Every call, every order, every ad — handled instantly</p>
      <div className="flex flex-wrap justify-center gap-2 mt-4">
        {[['AI Phone Agent','0.1s'],['Ad Manager','0.2s'],['Delivery Sync','0.3s'],['Order Hub','0.4s']].map(([l,d]) => (
          <span key={l} className="glass-card text-green-400 text-xs px-3 py-1.5 rounded-full cs-up"
            style={{ animationDelay: d, opacity: 0 }}>
            {l} ✓
          </span>
        ))}
      </div>
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // MANUAL + AUTO
  // ─────────────────────────────────────────────────────────────────────────────
  if (phase === 'manual' || phase === 'auto') {
    const isAuto = phase === 'auto'
    const timer  = isAuto ? aTimer : mTimer
    const activeEvents = events.filter(e => !e.handled && !e.missed)
    const missedEvents = events.filter(e => e.missed)

    return (
      <div className="max-w-2xl mx-auto space-y-4 relative">
        {/* flash overlay */}
        {flash && (
          <div className={`absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 z-20 px-4 py-2 rounded-full text-sm font-bold shadow-xl pointer-events-none transition-all
            ${flash.includes('missed') ? 'bg-red-500/90 text-white' : 'bg-green-500/90 text-white'}`}>
            {flash}
          </div>
        )}

        {/* ── header ── */}
        <div className={`rounded-2xl p-4 transition-all duration-500 ${justMissed ? 'border-red-500/40' : isAuto ? 'border-green-500/30' : 'border-yellow-500/20'}`}
          style={{ background: isAuto ? 'rgba(22,163,74,0.07)' : 'rgba(251,191,36,0.05)', border: `1px solid ${isAuto ? 'rgba(22,163,74,0.3)' : 'rgba(251,191,36,0.2)'}` }}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className={`font-bold text-sm ${isAuto ? 'text-green-400' : 'text-yellow-400'}`}>
                {isAuto ? 'AI MODE — Careful-Server is running' : 'MANUAL MODE — You\'re on your own'}
              </p>
              <p className="text-slate-500 text-xs mt-0.5">{rt?.icon} {rt?.label} · {ts?.label}</p>
            </div>
            <div className="flex items-center gap-4">
              {!isAuto && (
                <div className="text-center">
                  <p className="text-xs text-slate-500 mb-1">Stress</p>
                  <div className="w-20 h-2 bg-slate-800 rounded-full">
                    <div className="h-full rounded-full transition-all duration-300" style={{ width:`${stress}%`, background: stress>66?'#ef4444':stress>33?'#f59e0b':'#22c55e' }}/>
                  </div>
                </div>
              )}
              <div className={`text-4xl font-black tabular-nums ${timer <= 10 ? 'text-red-400 animate-pulse' : isAuto ? 'text-green-400' : 'text-white'}`}>
                {timer}s
              </div>
            </div>
          </div>

          {/* score row */}
          <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-white/5">
            <div>
              <p className="text-xs text-slate-500">Captured</p>
              <p className={`text-xl font-black ${isAuto ? 'text-green-400' : 'text-white'}`}>${isAuto ? aCap : mCap}</p>
            </div>
            {!isAuto && (
              <div>
                <p className="text-xs text-slate-500">Missed</p>
                <p className="text-xl font-black text-red-400">${mMiss}</p>
              </div>
            )}
            {!isAuto && (
              <div>
                <p className="text-xs text-slate-500">Best streak</p>
                <p className="text-xl font-black text-yellow-400">×{maxCombo}</p>
              </div>
            )}
            {isAuto && (
              <div>
                <p className="text-xs text-slate-500">Missed</p>
                <p className="text-xl font-black text-green-400">$0</p>
              </div>
            )}
            {isAuto && (
              <div>
                <p className="text-xs text-slate-500">vs manual</p>
                <p className="text-xl font-black text-slate-500 line-through">${mMiss}</p>
              </div>
            )}
          </div>
        </div>

        {/* ── instruction banner ── */}
        <div className={`text-center text-sm py-2 rounded-xl ${isAuto ? 'text-green-400 bg-green-500/8' : 'text-slate-300'}`}>
          {isAuto
            ? 'Every event is auto-handled before it expires — zero missed orders'
            : `Tap each card before the bar runs out! ${combo >= 3 ? `${combo}× combo!` : 'Build a combo streak for bonuses'}`}
        </div>

        {/* ── event cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 min-h-52">
          {activeEvents.map(e => {
            const age = Date.now() - e.born
            const pct = Math.max(0, Math.min(100, 100 - (age / e.maxAge) * 100))
            const urgent = pct < 30
            return (
              <button key={e.id}
                onClick={() => !isAuto && tap(e.id)}
                disabled={isAuto}
                className={`glass-card rounded-2xl p-3.5 text-left relative overflow-hidden transition-all
                  ${!isAuto ? 'hover:border-green-500/50 cursor-pointer active:scale-95 select-none' : 'cursor-default'}
                  ${urgent && !isAuto ? 'animate-pulse' : ''}`}
                style={{ border: `1px solid ${urgent && !isAuto ? 'rgba(239,68,68,0.5)' : isAuto ? 'rgba(22,163,74,0.3)' : 'rgba(255,255,255,0.07)'}` }}>
                {/* timer bar (manual) or shimmer (auto) */}
                {!isAuto && (
                  <div className="absolute bottom-0 left-0 h-1 transition-all duration-300 rounded-b-2xl"
                    style={{ width:`${pct}%`, background: urgent ? '#ef4444' : pct < 60 ? '#f59e0b' : '#22c55e' }}/>
                )}
                {isAuto && e.autoHandled && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-green-500 rounded-b-2xl cs-shimmer"/>
                )}

                <div className="flex items-start justify-between gap-1 mb-2">
                  <span className="text-xs font-bold text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">{e.icon}</span>
                  <div className="text-right">
                    {e.value > 0 && <p className={`text-sm font-black ${isAuto ? 'text-green-400' : urgent ? 'text-red-400' : 'text-green-400'}`}>${e.value}</p>}
                    {urgent && !isAuto && <p className="text-red-400 text-xs font-bold">NOW!</p>}
                    {isAuto && <p className="text-green-400 text-xs">✓ Auto</p>}
                  </div>
                </div>
                <p className="text-white text-xs font-semibold leading-snug">{e.label}</p>
                <p className={`text-xs mt-0.5 ${isAuto ? 'text-green-400' : 'text-slate-500'}`}>
                  {isAuto ? 'Handled instantly' : e.detail}
                </p>
              </button>
            )
          })}

          {/* missed tombstones */}
          {!isAuto && missedEvents.slice(-3).map(e => (
            <div key={e.id + 'm'} className="rounded-2xl p-3.5 opacity-30" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <div className="flex items-start justify-between mb-2">
                <span className="text-xs font-bold text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded">{e.icon}</span>
                {e.value > 0 && <p className="text-red-400 text-sm font-black line-through">${e.value}</p>}
              </div>
              <p className="text-slate-500 text-xs">Missed ✗</p>
            </div>
          ))}

          {/* empty state */}
          {activeEvents.length === 0 && missedEvents.length === 0 && (
            <div className="col-span-2 sm:col-span-3 flex items-center justify-center h-24 text-slate-700 text-sm">
              {isAuto ? 'AI handling all events…' : 'Events incoming…'}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RESULTS
  // ─────────────────────────────────────────────────────────────────────────────
  if (phase === 'results') {
    const manualTotal = mCap + mMiss
    const grade = captureRate >= 80 ? { l: 'Impressive!', sub: 'Still, AI captured 100%.', c: 'text-yellow-400' }
      : captureRate >= 50 ? { l: 'Average', sub: 'Half your orders slipped through.', c: 'text-orange-400' }
      : { l: 'Overwhelmed', sub: 'Most orders were missed.', c: 'text-red-400' }

    return (
      <div className="max-w-2xl mx-auto space-y-5 py-4">
        <div className="text-center">
          <h3 className="text-3xl font-extrabold text-white">Your Simulation Results</h3>
          <p className="text-slate-400 mt-1">{rt?.label} · {ts?.label}</p>
        </div>

        {/* head-to-head */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl p-5 space-y-3" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <p className="text-red-400 font-bold text-sm">Without CS <span className="font-normal opacity-60">(50s)</span></p>
            <div>
              <p className="text-slate-400 text-xs">Revenue captured</p>
              <p className="text-2xl font-black text-white">${mCap}</p>
            </div>
            <div>
              <p className="text-slate-400 text-xs">Revenue missed</p>
              <p className="text-2xl font-black text-red-400">${mMiss}</p>
            </div>
            <div>
              <p className="text-slate-400 text-xs">Capture rate</p>
              <p className={`text-lg font-black ${grade.c}`}>{captureRate}% <span className="text-sm font-normal">{grade.l}</span></p>
            </div>
            {maxCombo > 0 && <p className="text-slate-500 text-xs">Best combo: ×{maxCombo}</p>}
          </div>
          <div className="rounded-2xl p-5 space-y-3" style={{ background: 'rgba(22,163,74,0.07)', border: '1px solid rgba(22,163,74,0.25)' }}>
            <p className="text-green-400 font-bold text-sm">With Careful-Server <span className="font-normal opacity-60">(35s)</span></p>
            <div>
              <p className="text-slate-400 text-xs">Revenue captured</p>
              <p className="text-2xl font-black text-green-400">${aCap}</p>
            </div>
            <div>
              <p className="text-slate-400 text-xs">Revenue missed</p>
              <p className="text-2xl font-black text-green-400">$0</p>
            </div>
            <div>
              <p className="text-slate-400 text-xs">Capture rate</p>
              <p className="text-lg font-black text-green-400">100%</p>
            </div>
            <p className="text-green-500 text-xs">Zero stress. Zero missed orders.</p>
          </div>
        </div>

        {/* projection card */}
        {monthlyExtra > 0 && (
          <div className="rounded-2xl p-5 space-y-4" style={{ background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.2)' }}>
            <p className="text-green-400 text-xs font-bold uppercase tracking-widest">Your Personalised Revenue Projection</p>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl sm:text-3xl font-extrabold cs-grad-text">+${monthlyExtra.toLocaleString()}</p>
                <p className="text-slate-500 text-xs mt-0.5">Extra revenue/month</p>
              </div>
              <div>
                <p className="text-2xl sm:text-3xl font-extrabold cs-grad-text">+${(monthlyExtra * 12).toLocaleString()}</p>
                <p className="text-slate-500 text-xs mt-0.5">Per year</p>
              </div>
              <div>
                <p className="text-2xl sm:text-3xl font-extrabold cs-grad-text">
                  {monthlyExtra > planCost ? `${Math.round(monthlyExtra / planCost)}×` : '∞'}
                </p>
                <p className="text-slate-500 text-xs mt-0.5">ROI on Growth plan</p>
              </div>
            </div>
            <p className="text-slate-600 text-xs text-center">
              Based on {ts?.daily} daily orders at ${rt?.avg} avg · 4 peak hours/day · 26 working days/month
            </p>
          </div>
        )}

        {/* grade verdict */}
        <div className="glass-card rounded-xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold" style={{ background: captureRate >= 80 ? 'rgba(234,179,8,0.15)' : captureRate >= 50 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)', color: captureRate >= 80 ? '#eab308' : captureRate >= 50 ? '#f59e0b' : '#ef4444' }}>{captureRate >= 80 ? 'B+' : captureRate >= 50 ? 'C' : 'D'}</div>
          <div>
            <p className="text-white font-semibold">Verdict: {grade.l}</p>
            <p className="text-slate-400 text-sm mt-0.5">{grade.sub} Even the best human operator can't answer every call and handle every platform simultaneously. AI can.</p>
          </div>
        </div>

        {/* CTAs */}
        <div className="space-y-3">
          <button onClick={onSignup}
            className="w-full py-4 text-base font-bold text-white rounded-2xl shadow-2xl transition-all hover:opacity-90 hover:scale-105 cs-glow"
            style={{ background: 'linear-gradient(135deg,#16a34a,#22c55e)' }}>
            Recover That Revenue — Start Free Trial →
          </button>
          <button onClick={reset} className="w-full text-center text-slate-500 hover:text-slate-300 text-sm py-2 transition-colors">
            ↺ Run again with different settings
          </button>
        </div>
      </div>
    )
  }

  return null
}
