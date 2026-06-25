'use client'
import { useState, useEffect, useRef } from 'react'

interface DemoEvent {
  time: string
  source: 'customer' | 'platform' | 'employee' | 'owner'
  label: string
  detail: string
}

interface Scene {
  id: string
  step: string
  title: string
  subtitle: string
  duration: number
  events: DemoEvent[]
  statusCustomer: string
  statusEmployee: string
  statusOwner: string
}

const SOURCE_META: Record<string, { label: string; color: string }> = {
  customer: { label: 'Customer',       color: '#38bdf8' },
  platform: { label: 'Careful Server', color: '#22c55e' },
  employee: { label: 'Kitchen',        color: '#f59e0b' },
  owner:    { label: 'Owner',          color: '#818cf8' },
}

const SCENES: Scene[] = [
  {
    id: 'call',
    step: '01',
    title: 'AI Answers the Call',
    subtitle: 'A customer calls at 11:47 PM — after hours. The AI picks up in 0.2 seconds, no missed order.',
    duration: 4500,
    events: [
      { time: '11:47:02', source: 'customer',  label: 'Inbound Call',     detail: 'Customer dials the restaurant' },
      { time: '11:47:02', source: 'platform',  label: 'AI Picks Up',      detail: 'Connected in 0.2 s — zero missed calls' },
      { time: '11:47:03', source: 'platform',  label: 'Greeting Played',  detail: '"Thank you for calling! I\'m your AI order assistant."' },
    ],
    statusCustomer: 'Speaking with AI agent',
    statusEmployee: 'Off duty — AI is covering',
    statusOwner:    'Asleep — zero missed calls',
  },
  {
    id: 'order',
    step: '02',
    title: 'Order Taken in Under 2 Minutes',
    subtitle: 'AI walks the customer through the menu, confirms prices from the live menu, and locks in the order.',
    duration: 4500,
    events: [
      { time: '11:47:10', source: 'customer', label: 'Placed Order',        detail: '"Smash Burger, Truffle Fries, and an Iced Tea"' },
      { time: '11:47:13', source: 'platform', label: 'Items Confirmed',     detail: 'Matched against live menu — $20.50 total' },
      { time: '11:47:28', source: 'platform', label: 'Order #B47 Created',  detail: 'Pickup · 25 min · $20.50' },
      { time: '11:47:28', source: 'customer', label: 'Confirmation Given',  detail: '"Your order is confirmed! Ready in about 25 min."' },
    ],
    statusCustomer: 'Order #B47 confirmed — $20.50',
    statusEmployee: 'Off duty — AI is covering',
    statusOwner:    'Asleep — system capturing orders',
  },
  {
    id: 'kitchen',
    step: '03',
    title: 'Kitchen Ticket Appears Instantly',
    subtitle: 'No phone relay, no paper slip. The order pushes to the kitchen display in real time.',
    duration: 3500,
    events: [
      { time: '11:47:28', source: 'platform', label: 'Order Routed',      detail: 'Pushed to kitchen display and owner dashboard' },
      { time: '11:47:28', source: 'employee', label: 'Ticket Received',   detail: '#B47 — Smash Burger · Truffle Fries · Iced Tea' },
      { time: '11:47:35', source: 'employee', label: 'Status: Preparing', detail: 'Staff accepted — clock started' },
    ],
    statusCustomer: 'Waiting — ETA 25 min',
    statusEmployee: 'Preparing Order #B47',
    statusOwner:    'Dashboard notified',
  },
  {
    id: 'dashboard',
    step: '04',
    title: 'Owner Sees Everything Live',
    subtitle: 'Revenue, orders, and AI call logs update in real time — no spreadsheets, no manual entry.',
    duration: 3500,
    events: [
      { time: '11:47:28', source: 'owner', label: 'Revenue Updated', detail: 'Today: $2,840.00 → $2,860.50' },
      { time: '11:47:28', source: 'owner', label: 'Order Count',     detail: 'Today\'s orders: 47 → 48' },
      { time: '11:47:29', source: 'owner', label: 'Call Logged',     detail: 'Call #12 · 1m 26s · Pickup · $20.50' },
    ],
    statusCustomer: 'Order being prepared',
    statusEmployee: 'Order #B47 in progress',
    statusOwner:    'Revenue: $2,860.50 — 48 orders',
  },
  {
    id: 'ads',
    step: '05',
    title: 'Owner Launches Ads Across 6 Platforms',
    subtitle: 'One click. AI writes the copy, generates the image, and goes live on every platform simultaneously.',
    duration: 4000,
    events: [
      { time: '09:00:00', source: 'owner',    label: 'Campaign Created',    detail: '"Weekend Special — 20% off orders over $25"' },
      { time: '09:00:02', source: 'platform', label: 'AI Creative Ready',   detail: 'Ad image and copy generated in 3.8 seconds' },
      { time: '09:00:06', source: 'platform', label: '6 Platforms Live',    detail: 'Meta · Google · YouTube · TikTok · Snapchat · Pinterest' },
      { time: '09:00:06', source: 'owner',    label: 'All Campaigns Active', detail: 'Budget set · targeting configured · running' },
    ],
    statusCustomer: 'Browsing social media',
    statusEmployee: 'Normal service',
    statusOwner:    '6-platform campaign live',
  },
  {
    id: 'return',
    step: '06',
    title: 'New Customer — The Cycle Repeats',
    subtitle: 'The ad brings in a new customer. AI answers, takes the order, revenue grows — automatically.',
    duration: 3500,
    events: [
      { time: '10:32:14', source: 'customer', label: 'Saw the Ad',       detail: 'Weekend Special on Instagram — tapped to call' },
      { time: '10:32:18', source: 'platform', label: 'AI Answers',       detail: 'New customer connected in 0.2 s' },
      { time: '10:32:51', source: 'platform', label: 'Order #B48 Done',  detail: '$32.00 — promo applied automatically' },
      { time: '10:32:51', source: 'owner',    label: 'Revenue Grows',    detail: 'Orders: 49 — Today: $2,886.50' },
    ],
    statusCustomer: 'New order placed — $32.00',
    statusEmployee: 'Preparing next order',
    statusOwner:    'Revenue: $2,886.50 — 49 orders',
  },
]

export default function FlowDemo() {
  const [sceneIdx, setSceneIdx]       = useState(0)
  const [visibleEvt, setVisibleEvt]   = useState<number[]>([])
  const [progress, setProgress]       = useState(0)
  const [paused, setPaused]           = useState(false)
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const scene = SCENES[sceneIdx]

  function clearTimers() {
    if (timerRef.current)    clearTimeout(timerRef.current)
    if (progressRef.current) clearInterval(progressRef.current)
  }

  function jumpTo(i: number) {
    clearTimers()
    setSceneIdx(i)
    setPaused(false)
  }

  useEffect(() => {
    if (paused) return
    setVisibleEvt([])
    setProgress(0)

    // Stagger events in
    scene.events.forEach((_, i) => {
      timerRef.current = setTimeout(() => {
        setVisibleEvt(prev => [...prev, i])
      }, 400 + i * 650)
    })

    // Progress bar tick
    const interval = 40
    const steps = scene.duration / interval
    let step = 0
    progressRef.current = setInterval(() => {
      step++
      setProgress(Math.min((step / steps) * 100, 100))
      if (step >= steps) clearInterval(progressRef.current!)
    }, interval)

    // Auto-advance
    timerRef.current = setTimeout(() => {
      setSceneIdx(i => (i + 1) % SCENES.length)
    }, scene.duration)

    return clearTimers
  }, [sceneIdx, paused])

  return (
    <div
      className="rounded-2xl overflow-hidden select-none"
      style={{ background: '#060f1e', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      {/* ── Header ───────────────────────────────────────────────── */}
      <div
        className="px-5 py-3.5 flex items-center justify-between gap-4"
        style={{ background: 'rgba(15,23,42,0.9)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex items-center gap-1.5 shrink-0">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-green-400 text-xs font-bold tracking-widest uppercase">Live</span>
          </span>
          <span className="text-slate-600 text-sm">|</span>
          <span className="text-white text-sm font-semibold truncate">{scene.title}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-slate-600 text-xs font-mono">{scene.step}/{SCENES.length.toString().padStart(2,'0')}</span>
          <button
            onClick={() => setPaused(p => !p)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)' }}
            title={paused ? 'Resume' : 'Pause'}
          >
            {paused
              ? <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M8 5v14l11-7z"/></svg>
              : <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
            }
          </button>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────── */}
      <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-white/5">

        {/* Event feed */}
        <div className="md:col-span-2 p-5" style={{ minHeight: 240 }}>
          <p className="text-slate-500 text-xs mb-4 leading-relaxed">{scene.subtitle}</p>
          <div className="space-y-2.5">
            {scene.events.map((ev, i) => {
              const meta = SOURCE_META[ev.source]
              const show = visibleEvt.includes(i)
              return (
                <div
                  key={i}
                  className="flex items-start gap-3 transition-all duration-500"
                  style={{ opacity: show ? 1 : 0, transform: show ? 'translateY(0)' : 'translateY(6px)' }}
                >
                  <span className="text-slate-600 text-xs font-mono pt-px shrink-0 w-[4.5rem]">{ev.time}</span>
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
                    style={{ color: meta.color, background: `${meta.color}18` }}
                  >
                    {meta.label}
                  </span>
                  <span className="text-xs leading-relaxed">
                    <span className="text-white font-medium">{ev.label}</span>
                    <span className="text-slate-400"> — {ev.detail}</span>
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Status panels */}
        <div className="p-4 flex flex-col gap-3">
          <p className="text-slate-600 text-xs uppercase tracking-widest font-semibold">Current Status</p>
          {(
            [
              { key: 'customer', status: scene.statusCustomer },
              { key: 'employee', status: scene.statusEmployee },
              { key: 'owner',    status: scene.statusOwner    },
            ] as const
          ).map(({ key, status }) => {
            const meta = SOURCE_META[key]
            return (
              <div
                key={key}
                className="rounded-xl px-3.5 py-3 flex flex-col gap-1"
                style={{ background: 'rgba(255,255,255,0.025)', border: `1px solid ${meta.color}22` }}
              >
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: meta.color }} />
                  <span className="text-xs font-semibold" style={{ color: meta.color }}>{meta.label}</span>
                </div>
                <p className="text-slate-300 text-xs leading-relaxed">{status}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Timeline ─────────────────────────────────────────────── */}
      <div
        className="px-5 pt-3.5 pb-4"
        style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
      >
        {/* scene progress bar */}
        <div className="h-px rounded-full overflow-hidden mb-4" style={{ background: 'rgba(255,255,255,0.07)' }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${progress}%`, background: 'linear-gradient(90deg,#16a34a,#6366f1)', transition: 'none' }}
          />
        </div>

        {/* step buttons */}
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${SCENES.length},1fr)` }}>
          {SCENES.map((s, i) => {
            const active = i === sceneIdx
            const done   = i < sceneIdx
            return (
              <button
                key={s.id}
                onClick={() => jumpTo(i)}
                className="flex flex-col items-center gap-1.5 group"
              >
                <div
                  className="w-full h-1 rounded-full transition-all duration-500"
                  style={{
                    background: active
                      ? 'linear-gradient(90deg,#16a34a,#6366f1)'
                      : done
                      ? 'rgba(22,163,74,0.35)'
                      : 'rgba(255,255,255,0.07)',
                  }}
                />
                <span
                  className="text-xs font-mono transition-colors duration-300 hidden sm:block"
                  style={{ color: active ? '#fff' : done ? '#22c55e' : '#1e293b' }}
                >
                  {s.step}
                </span>
              </button>
            )
          })}
        </div>

        {/* step labels */}
        <div
          className="hidden sm:grid mt-1.5 gap-1"
          style={{ gridTemplateColumns: `repeat(${SCENES.length},1fr)` }}
        >
          {SCENES.map((s, i) => (
            <p
              key={s.id}
              className="text-center text-xs leading-tight px-0.5 transition-colors duration-300 cursor-pointer"
              style={{ color: i === sceneIdx ? '#64748b' : '#1e293b' }}
              onClick={() => jumpTo(i)}
            >
              {s.title.split(' ').slice(0, 3).join(' ')}
            </p>
          ))}
        </div>
      </div>
    </div>
  )
}
