'use client'
import { useState, useEffect, useCallback } from 'react'

export interface TourStep {
  targetId: string   // data-tour-id value
  title: string
  body: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
}

interface Rect { top: number; left: number; width: number; height: number }

interface Props {
  steps: TourStep[]
  accent: string
  onDone: () => void
}

function getRect(id: string): Rect | null {
  const el = document.querySelector(`[data-tour-id="${id}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { top: r.top + window.scrollY, left: r.left, width: r.width, height: r.height }
}

function tooltipPos(rect: Rect, placement: string, tw = 300, th = 160): { top: number; left: number } {
  const GAP = 16
  const vw = window.innerWidth
  const vh = window.innerHeight + window.scrollY

  let top = 0, left = 0

  if (placement === 'bottom') {
    top  = rect.top + rect.height + GAP
    left = rect.left + rect.width / 2 - tw / 2
  } else if (placement === 'top') {
    top  = rect.top - th - GAP
    left = rect.left + rect.width / 2 - tw / 2
  } else if (placement === 'left') {
    top  = rect.top + rect.height / 2 - th / 2
    left = rect.left - tw - GAP
  } else {
    top  = rect.top + rect.height / 2 - th / 2
    left = rect.left + rect.width + GAP
  }

  // clamp
  left = Math.max(12, Math.min(vw - tw - 12, left))
  top  = Math.max(window.scrollY + 12, Math.min(vh - th - 12, top))
  return { top, left }
}

export default function TourOverlay({ steps, accent, onDone }: Props) {
  const [step, setStep]     = useState(0)
  const [rect, setRect]     = useState<Rect | null>(null)
  const [visible, setVisible] = useState(false)

  const cur = steps[step]

  const refresh = useCallback(() => {
    if (!cur) return
    const r = getRect(cur.targetId)
    if (r) {
      // scroll into view
      const el = document.querySelector(`[data-tour-id="${cur.targetId}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setTimeout(() => {
        const rr = getRect(cur.targetId)
        setRect(rr)
        setVisible(true)
      }, 320)
    } else {
      setRect(null)
      setVisible(true)
    }
  }, [cur])

  useEffect(() => { refresh() }, [refresh])

  function advance() {
    setVisible(false)
    setTimeout(() => {
      if (step < steps.length - 1) {
        setStep(s => s + 1)
      } else {
        onDone()
      }
    }, 200)
  }

  function back() {
    setVisible(false)
    setTimeout(() => setStep(s => s - 1), 200)
  }

  const PAD = 10
  const TW  = 300

  const tp = rect
    ? tooltipPos(rect, cur.placement ?? 'bottom', TW)
    : { top: window.scrollY + window.innerHeight / 2 - 80, left: window.innerWidth / 2 - TW / 2 }

  return (
    <>
      {/* dim overlay */}
      <div
        className="fixed inset-0 z-[200] pointer-events-none transition-opacity duration-300"
        style={{ background: 'rgba(0,0,0,0.55)', opacity: visible ? 1 : 0 }}
      />

      {/* spotlight hole */}
      {rect && (
        <div
          className="fixed z-[201] rounded-xl pointer-events-none transition-all duration-300"
          style={{
            top:    rect.top  - PAD - window.scrollY,
            left:   rect.left - PAD,
            width:  rect.width  + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: `0 0 0 9999px rgba(0,0,0,0.55), 0 0 0 3px ${accent}, 0 0 30px ${accent}50`,
            opacity: visible ? 1 : 0,
            transition: 'all 0.3s ease',
          }}
        />
      )}

      {/* tooltip */}
      <div
        className="fixed z-[202] transition-all duration-300 pointer-events-auto"
        style={{
          top:     tp.top - window.scrollY,
          left:    tp.left,
          width:   TW,
          opacity: visible ? 1 : 0,
          transform: `translateY(${visible ? 0 : 8}px)`,
        }}
      >
        <div className="rounded-2xl shadow-2xl overflow-hidden"
          style={{ background: '#0f172a', border: `1px solid ${accent}40` }}>
          {/* header stripe */}
          <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${accent}, #818cf8)` }}/>

          <div className="p-4">
            {/* step counter */}
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex gap-1">
                {steps.map((_, i) => (
                  <div key={i} className="h-1.5 rounded-full transition-all duration-300"
                    style={{ width: i === step ? 20 : 6, background: i <= step ? accent : 'rgba(255,255,255,0.12)' }}/>
                ))}
              </div>
              <span className="text-slate-500 text-xs">{step + 1} / {steps.length}</span>
            </div>

            <h3 className="text-white font-bold text-sm mb-1.5">{cur.title}</h3>
            <p className="text-slate-400 text-xs leading-relaxed">{cur.body}</p>
          </div>

          {/* actions */}
          <div className="px-4 pb-4 flex items-center justify-between gap-2">
            <button onClick={onDone} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
              Skip tour
            </button>
            <div className="flex gap-2">
              {step > 0 && (
                <button onClick={back}
                  className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-all">
                  ← Back
                </button>
              )}
              <button onClick={advance}
                className="text-xs px-4 py-1.5 rounded-lg font-semibold text-white transition-all hover:opacity-90"
                style={{ background: accent }}>
                {step < steps.length - 1 ? 'Next →' : 'Done 🎉'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
