'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { api, StaffPolicy, LiveData, StaffMessage } from '@/lib/api'
import { isBiometricAvailable, verifyBiometric } from '@/lib/webauthn'

// ─── Legacy message display ─────────────────────────────────────────────────

function displayContent(content: string): string {
  // Old messages were encrypted client-side — show a fallback for unreadable base64.
  if (content.length > 50 && /^[A-Za-z0-9+/]{50,}$/.test(content) && !content.includes(' ')) {
    return '[legacy encrypted message]'
  }
  return content
}

// ─── Haversine distance ───────────────────────────────────────────────────────

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ─── Time helpers ─────────────────────────────────────────────────────────────

function formatClock(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatDateLong(d: Date): string {
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
}

function elapsedSince(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ${mins % 60}m ago`
}

function shiftDuration(iso: string): string {
  const totalSecs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = totalSecs % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function breakDuration(startIso: string): string {
  return shiftDuration(startIso)
}

// ─── Phone Lock Setup Wizard ──────────────────────────────────────────────────

function PhoneLockSetup({ onComplete, onSkip }: { onComplete: () => void; onSkip: () => void }) {
  const [step, setStep] = useState(0)
  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)

  function openSettings() {
    if (isIOS) {
      window.location.href = 'App-Prefs:root=ACCESSIBILITY'
    }
  }

  const iosSteps = [
    {
      title: 'Enable Guided Access',
      body: 'Open your phone Settings, tap Accessibility, scroll down to Guided Access and turn it on. You only need to do this once.',
      action: 'Open Settings',
      onAction: openSettings,
    },
    {
      title: 'Activate Focus Lock',
      body: 'Triple-click the side button (power button) right now. A purple border will appear — tap Start. Your phone is now locked to this app.',
      action: 'Done — I triple-clicked',
      onAction: onComplete,
    },
  ]

  const androidSteps = [
    {
      title: 'Enable Screen Pinning',
      body: 'Open Settings → Security (or Biometrics & Security) → Pin Windows or Screen Pinning, and turn it on. You only need to do this once.',
      action: null,
      onAction: null,
    },
    {
      title: 'Pin This App',
      body: 'Tap the square Recent Apps button at the bottom of your phone. Find Careful Server, tap the app icon at the top of the card, then tap Pin.',
      action: 'Done — App is pinned',
      onAction: onComplete,
    },
  ]

  const steps = isIOS ? iosSteps : androidSteps
  const current = steps[step]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#0f172a] border border-white/10 rounded-t-3xl p-7 w-full max-w-sm">
        {/* Step dots */}
        <div className="flex justify-center gap-2 mb-6">
          {steps.map((_, i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full transition-colors"
              style={{ backgroundColor: i === step ? '#16a34a' : 'rgba(255,255,255,0.15)' }}
            />
          ))}
        </div>

        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[#16a34a] text-xs font-bold uppercase tracking-widest">Step {step + 1} of {steps.length}</span>
        </div>
        <h2 className="text-white text-xl font-bold mb-3">{current.title}</h2>
        <p className="text-[#94a3b8] text-sm leading-relaxed mb-7">{current.body}</p>

        <div className="space-y-3">
          {current.action && (
            <button
              onClick={current.onAction ?? (() => {})}
              className="w-full py-4 rounded-2xl bg-[#16a34a] hover:bg-[#15803d] text-white font-bold text-base transition-colors active:scale-[0.98]"
            >
              {current.action}
            </button>
          )}
          {step < steps.length - 1 && (
            <button
              onClick={() => setStep(s => s + 1)}
              className="w-full py-3.5 rounded-2xl border border-white/10 text-white font-semibold text-base hover:border-white/20 transition-colors"
            >
              Next
            </button>
          )}
          <button
            onClick={onSkip}
            className="w-full py-3 text-[#64748b] text-sm hover:text-[#94a3b8] transition-colors"
          >
            Skip — set up later
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Emergency overlay ────────────────────────────────────────────────────────

function EmergencyOverlay({
  contacts,
  onClose,
}: {
  contacts: { name: string; phone: string; relation: string }[]
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm px-6">
      <div className="bg-[#0f172a] border border-red-900/50 rounded-2xl p-6 w-full max-w-sm">
        <h2 className="text-white text-xl font-bold text-center mb-4">Emergency</h2>
        <a
          href="tel:911"
          className="flex items-center justify-center w-full py-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl mb-4 text-xl transition-colors active:scale-95"
        >
          Call 911
        </a>
        {contacts.length > 0 && (
          <div className="space-y-2 mb-4">
            {contacts.map((c, i) => (
              <a
                key={i}
                href={`tel:${c.phone}`}
                className="flex items-center justify-between bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-4 py-3 transition-colors"
              >
                <div>
                  <p className="text-white text-sm font-medium">{c.name}</p>
                  <p className="text-[#94a3b8] text-xs">{c.relation}</p>
                </div>
                <span className="text-red-400 text-sm font-semibold">{c.phone}</span>
              </a>
            ))}
          </div>
        )}
        <button
          onClick={onClose}
          className="w-full py-3 text-[#94a3b8] hover:text-white text-sm border border-white/10 rounded-xl transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  )
}

// ─── Exit Code Screen ─────────────────────────────────────────────────────────

function ExitCodeScreen({
  exitType,
  exitCode,
  onCancel,
  onSuccess,
}: {
  exitType: 'clock_out' | 'break'
  exitCode: string
  onCancel: () => void
  onSuccess: (exitType: string) => void
}) {
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', ''])
  const [shake, setShake] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [])

  async function submitCode(code: string) {
    if (submitting) return
    setSubmitting(true)
    setError('')
    try {
      const result = await api.staff.confirmExit(code)
      onSuccess(result.exit_type)
    } catch {
      setShake(true)
      setError('Incorrect code')
      setTimeout(() => {
        setShake(false)
        setDigits(['', '', '', '', '', ''])
        inputRefs.current[0]?.focus()
      }, 700)
    } finally {
      setSubmitting(false)
    }
  }

  function handleDigitChange(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1)
    const newDigits = [...digits]
    newDigits[index] = digit
    setDigits(newDigits)
    setError('')

    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }

    if (digit && newDigits.every(d => d !== '')) {
      submitCode(newDigits.join(''))
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      const newDigits = [...digits]
      newDigits[index - 1] = ''
      setDigits(newDigits)
      inputRefs.current[index - 1]?.focus()
    }
  }

  return (
    <div className="fixed inset-0 bg-[#020617] flex flex-col items-center justify-center px-6">
      {/* Lock icon */}
      <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-8">
        <svg className="w-10 h-10 text-[#94a3b8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
      </div>

      <h2 className="text-white text-2xl font-bold text-center mb-3">Your Exit Code</h2>
      <p className="text-[#94a3b8] text-sm text-center mb-8 max-w-xs leading-relaxed">
        The code below was generated for this session. Type it to confirm and exit Focus Mode.
      </p>

      {/* Code display */}
      {exitCode && (
        <div className="flex gap-3 mb-8">
          {exitCode.split('').map((digit, i) => (
            <div
              key={i}
              className="w-11 h-14 rounded-xl bg-[#0f172a] border border-[#16a34a]/50 flex items-center justify-center"
            >
              <span className="text-[#16a34a] text-2xl font-bold font-mono">{digit}</span>
            </div>
          ))}
        </div>
      )}

      <p className="text-[#64748b] text-xs text-center mb-4">Type this code below to confirm:</p>

      {/* 6 digit input boxes */}
      <div className={`flex gap-3 mb-6 transition-all ${shake ? 'animate-bounce' : ''}`}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={el => { inputRefs.current[i] = el }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            value={d}
            onChange={e => handleDigitChange(i, e.target.value)}
            onKeyDown={e => handleKeyDown(i, e)}
            className={`w-11 h-14 text-center text-xl font-bold rounded-xl border text-white bg-[#0f172a] focus:outline-none transition-colors
              ${d ? 'border-[#16a34a] bg-[#16a34a]/10' : 'border-white/20'}
              ${shake ? 'border-red-500' : ''}
            `}
          />
        ))}
      </div>

      {error && (
        <p className="text-red-400 text-sm text-center mb-6">{error}</p>
      )}

      {submitting && (
        <div className="mb-6">
          <div className="w-6 h-6 border-2 border-white/20 border-t-[#16a34a] rounded-full animate-spin" />
        </div>
      )}

      <button
        onClick={onCancel}
        className="w-full max-w-xs py-4 rounded-xl border border-white/10 text-[#94a3b8] text-sm font-medium hover:border-white/20 hover:text-white transition-colors"
      >
        Cancel — Return to Work
      </button>

      {exitType === 'break' && (
        <p className="text-[#64748b] text-xs text-center mt-4">
          Enter the code above to start your break
        </p>
      )}
    </div>
  )
}

// ─── Break Screen ─────────────────────────────────────────────────────────────

function BreakScreen({
  breakStartIso,
  now,
  onReturn,
}: {
  breakStartIso: string
  now: Date
  onReturn: () => void
}) {
  return (
    <div className="fixed inset-0 bg-[#020617] flex flex-col items-center justify-center px-6">
      {/* Coffee cup icon */}
      <div className="w-20 h-20 rounded-2xl bg-amber-900/30 border border-amber-700/30 flex items-center justify-center mb-8">
        <svg className="w-10 h-10 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12H3v4.125c0 2.485 2.016 4.5 4.5 4.5h.75m6-8.25H6a.75.75 0 00-.75.75V13.5a4.5 4.5 0 004.5 4.5h3a4.5 4.5 0 004.5-4.5V6a.75.75 0 00-.75-.75h-.75m-4.5 9.75v3" />
        </svg>
      </div>

      <h2 className="text-white text-2xl font-bold text-center mb-2">On Break</h2>

      <p className="text-amber-400 text-4xl font-bold font-mono tabular-nums my-4">
        {breakDuration(breakStartIso)}
      </p>

      <p className="text-[#94a3b8] text-sm text-center mb-10 max-w-xs">
        Rest up — your team is counting on you.
      </p>

      <p className="text-[#64748b] text-xs text-center mb-2">Current time</p>
      <p className="text-white text-2xl font-bold font-mono tabular-nums mb-10">
        {formatClock(now)}
      </p>

      <button
        onClick={onReturn}
        className="w-full max-w-xs py-4 rounded-2xl bg-[#16a34a] hover:bg-[#15803d] text-white text-base font-bold transition-colors active:scale-[0.98]"
      >
        Return to Focus Mode
      </button>
    </div>
  )
}

// ─── Auto clock-out overlay ───────────────────────────────────────────────────

function AutoClockOutOverlay({ reason }: { reason: string }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 px-6">
      <div className="w-16 h-16 rounded-full bg-red-900/40 border border-red-500/50 flex items-center justify-center mb-6">
        <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </div>
      <p className="text-red-400 text-xl font-bold text-center mb-3">{reason}</p>
      <p className="text-[#94a3b8] text-sm text-center">Redirecting in a moment...</p>
      <div className="mt-6 w-6 h-6 border-2 border-white/20 border-t-red-400 rounded-full animate-spin" />
    </div>
  )
}

// ─── Main kiosk page ──────────────────────────────────────────────────────────

type Screen = 'loading' | 'focus' | 'exit-request' | 'break'

export default function AppKioskPage() {
  const router = useRouter()
  const accent = '#16a34a'

  // State machine
  const [screen, setScreen] = useState<Screen>('loading')
  const [exitType, setExitType] = useState<'clock_out' | 'break'>('clock_out')
  const [exitCode, setExitCode] = useState('')
  const [breakStartIso, setBreakStartIso] = useState<string | null>(null)

  // Data
  const [policy, setPolicy] = useState<StaffPolicy | null>(null)
  const [live, setLive] = useState<LiveData | null>(null)
  const [messages, setMessages] = useState<StaffMessage[]>([])
  const [tenantName, setTenantName] = useState('Careful Server')
  const [tenantSlug, setTenantSlug] = useState('')
  const [shiftStart, setShiftStart] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')

  // UI state
  const [now, setNow] = useState(new Date())
  const [showEmergency, setShowEmergency] = useState(false)
  const [focusBanner, setFocusBanner] = useState(false)
  const [msgInput, setMsgInput] = useState('')
  const [sending, setSending] = useState(false)
  const [requestingExit, setRequestingExit] = useState(false)
  const [exitBiometricState, setExitBiometricState] = useState(false)
  const [error, setError] = useState('')
  const [autoClockOutReason, setAutoClockOutReason] = useState('')

  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const msgBottomRef = useRef<HTMLDivElement>(null)
  const autoClockOutRef = useRef(false) // prevent double auto-clockout

  // ── Clock tick ──
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(iv)
  }, [])

  // ── Fullscreen + security ──
  // ── Automatic lockdown (runs once on mount) ──
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyDoc = document as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyScreen = window.screen as any

    // ── Enter fullscreen, hiding the navigation bar ──
    let fsDebounce: ReturnType<typeof setTimeout> | null = null
    function enterFullscreen() {
      if (fsDebounce) return // debounce rapid re-requests
      fsDebounce = setTimeout(() => { fsDebounce = null }, 300)
      const isFs = !!(document.fullscreenElement || anyDoc.webkitFullscreenElement || anyDoc.mozFullScreenElement)
      if (isFs) return
      const el = document.documentElement
      const req = (el as HTMLElement & { requestFullscreen?: (o?: object) => Promise<void>; webkitRequestFullscreen?: (o?: object) => Promise<void>; mozRequestFullScreen?: () => Promise<void> })
      ;(req.requestFullscreen?.({ navigationUI: 'hide' }) ??
        req.webkitRequestFullscreen?.({ navigationUI: 'hide' }) ??
        req.mozRequestFullScreen?.())?.catch(() => {})
    }

    // ── Lock orientation to portrait ──
    function lockOrientation() {
      try { anyScreen?.orientation?.lock?.('portrait').catch(() => {}) } catch {}
    }

    // Initial lockdown
    enterFullscreen()
    lockOrientation()

    // ── Re-enter fullscreen immediately when it is lost (back/home buttons) ──
    function onFullscreenChange() {
      const isFs = !!(document.fullscreenElement || anyDoc.webkitFullscreenElement || anyDoc.mozFullScreenElement)
      if (!isFs) {
        // Two-shot: immediately + after a short delay (handles OS animation lag)
        enterFullscreen()
        setTimeout(enterFullscreen, 250)
      }
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    document.addEventListener('webkitfullscreenchange', onFullscreenChange)
    document.addEventListener('mozfullscreenchange', onFullscreenChange)

    // ── Re-assert when window regains focus (after home/recents dismiss) ──
    function onWindowFocus() {
      enterFullscreen()
      lockOrientation()
    }
    window.addEventListener('focus', onWindowFocus)

    // ── Heartbeat: check every 1.5 s — catches anything the events miss ──
    const heartbeat = setInterval(() => {
      const isFs = !!(document.fullscreenElement || anyDoc.webkitFullscreenElement || anyDoc.mozFullScreenElement)
      if (!isFs && !document.hidden) enterFullscreen()
    }, 1500)

    // ── History trap — absorbs back-button and swipe-back (Android + iOS PWA) ──
    // Push three states so multiple back presses are absorbed
    window.history.pushState(null, '', window.location.href)
    window.history.pushState(null, '', window.location.href)
    window.history.pushState(null, '', window.location.href)
    function onPopState() {
      window.history.pushState(null, '', window.location.href)
      enterFullscreen() // back gesture also exits fullscreen, re-enter immediately
    }
    window.addEventListener('popstate', onPopState)

    // ── Block context menu and destructive keyboard shortcuts ──
    const noCtx = (e: MouseEvent) => e.preventDefault()
    document.addEventListener('contextmenu', noCtx)
    const noKeys = (e: KeyboardEvent) => {
      if (e.key === 'F12' || e.key === 'Escape') { e.preventDefault(); return }
      if ((e.ctrlKey || e.metaKey) && ['r', 'w', 't', 'l', 'n', 'h'].includes(e.key.toLowerCase())) {
        e.preventDefault()
      }
    }
    document.addEventListener('keydown', noKeys)

    return () => {
      clearInterval(heartbeat)
      if (fsDebounce) clearTimeout(fsDebounce)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange)
      document.removeEventListener('mozfullscreenchange', onFullscreenChange)
      window.removeEventListener('focus', onWindowFocus)
      window.removeEventListener('popstate', onPopState)
      document.removeEventListener('contextmenu', noCtx)
      document.removeEventListener('keydown', noKeys)
    }
  }, [])

  // ── Wake Lock ──
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null
    async function requestWakeLock() {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as Navigator & { wakeLock: { request: (type: string) => Promise<WakeLockSentinel> } }).wakeLock.request('screen')
        }
      } catch { /* not supported or denied */ }
    }
    requestWakeLock()
    // Re-acquire wake lock when tab becomes visible again (OS releases it on hide)
    function onVisibilityForWakeLock() {
      if (!document.hidden) requestWakeLock()
    }
    document.addEventListener('visibilitychange', onVisibilityForWakeLock)
    return () => {
      wakeLock?.release().catch(() => {})
      document.removeEventListener('visibilitychange', onVisibilityForWakeLock)
    }
  }, [])

  // ── Focus exit tracking + re-lock on return ──
  useEffect(() => {
    if (screen !== 'focus') return
    function handleVisibility() {
      if (document.hidden) {
        api.staff.focusExit().catch(() => {})
      } else {
        // Re-assert fullscreen as soon as employee returns to the app
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const el = document.documentElement as any
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const anyDoc = document as any
          const isFs = !!(document.fullscreenElement || anyDoc.webkitFullscreenElement || anyDoc.mozFullScreenElement)
          if (!isFs) {
            ;(el.requestFullscreen?.({ navigationUI: 'hide' }) ??
              el.webkitRequestFullscreen?.({ navigationUI: 'hide' }) ??
              el.mozRequestFullScreen?.())?.catch(() => {})
          }
        } catch {}
        setFocusBanner(true)
        if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current)
        bannerTimerRef.current = setTimeout(() => setFocusBanner(false), 3000)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [screen])

  // ── Geofencing watchPosition ──
  useEffect(() => {
    if (screen !== 'focus' || !policy?.geofence_enabled || policy.geofence_lat == null) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) return

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const dist = getDistanceMeters(
          pos.coords.latitude,
          pos.coords.longitude,
          policy.geofence_lat!,
          policy.geofence_lng!
        )
        if (dist > (policy.geofence_radius_m ?? 150) + 50) {
          handleAutoClockOut('You have left the restaurant. Your shift has been ended automatically.')
        }
      },
      () => {}, // ignore errors silently
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 60000 }
    )
    return () => navigator.geolocation.clearWatch(watchId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, policy])

  async function handleAutoClockOut(reason: string) {
    if (autoClockOutRef.current) return
    autoClockOutRef.current = true
    setAutoClockOutReason(reason)
    try {
      await api.staff.clockOut()
    } catch { /* best effort */ }
    setTimeout(() => {
      router.replace('/app/home')
    }, 3000)
  }

  // ── Initial load ──
  const load = useCallback(async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    if (!token) {
      router.replace('/app/login')
      return
    }

    try {
      const [dash, shift, pol] = await Promise.all([
        api.portal.dashboard(),
        api.staff.currentShift(),
        api.staff.getPolicy(),
      ])

      if (!shift) {
        router.replace('/app/home')
        return
      }

      setShiftStart(shift.clocked_in_at)
      setPolicy(pol)
      const dashAny = dash as unknown as { tenant: { name: string; slug: string } }
      setTenantName(dashAny.tenant?.name ?? 'Careful Server')
      const slug = dashAny.tenant?.slug ?? ''
      setTenantSlug(slug)
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        setDisplayName(payload.display_name || '')
      } catch { /* ignore */ }

      const [liveData, msgs] = await Promise.all([api.staff.getLive(), api.staff.getMessages()])
      setLive(liveData)
      setMessages(msgs.slice(0, 10))

      setScreen('focus')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load'
      if (!localStorage.getItem('token')) {
        router.replace('/app/login')
        return
      }
      setError(msg)
      setScreen('focus')
    }
  }, [router])

  useEffect(() => {
    load()
  }, [load])

  // ── Live data polling (every 15s) ──
  useEffect(() => {
    if (screen !== 'focus') return
    const fetchLive = async () => {
      try {
        const data = await api.staff.getLive()
        setLive(data)
      } catch {}
    }
    const iv = setInterval(fetchLive, 15000)
    return () => clearInterval(iv)
  }, [screen])

  // ── Message polling (every 20s) ──
  useEffect(() => {
    if (screen !== 'focus') return
    const fetchMsgs = async () => {
      try {
        const msgs = await api.staff.getMessages()
        setMessages(msgs.slice(0, 10))
      } catch {}
    }
    const iv = setInterval(fetchMsgs, 20000)
    return () => clearInterval(iv)
  }, [screen])

  // ── Scroll chat to bottom ──
  useEffect(() => {
    msgBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Friendly error helper ──
  function showFriendlyError(e: unknown, fallback: string) {
    let msg = e instanceof Error ? e.message : fallback
    if (/http|webauthn|credential/i.test(msg)) {
      msg = 'Biometric check skipped. Proceed with exit code.'
    }
    setError(msg)
    setTimeout(() => setError(''), 3000)
  }

  // ── Request exit (Clock Out or Break) — biometric only when enrolled ──
  async function requestExit(type: 'clock_out' | 'break') {
    setRequestingExit(true)
    setError('')
    try {
      const available = await isBiometricAvailable()
      if (available) {
        try {
          const status = await api.webauthn.status()
          if (status.enrolled) {
            setExitBiometricState(true)
            await verifyBiometric()
          }
        } catch {
          // biometric not enrolled or failed — skip and proceed to exit code
        } finally {
          setExitBiometricState(false)
        }
      }

      const result = await api.staff.requestExit(type)
      setExitCode(result.code)
      setExitType(type)
      setScreen('exit-request')
    } catch (e: unknown) {
      setExitBiometricState(false)
      showFriendlyError(e, 'Failed to request exit')
    } finally {
      setRequestingExit(false)
    }
  }

  // ── Exit code confirmed ──
  async function handleExitConfirmed(confirmedExitType: string) {
    setExitCode('') // clear code from memory
    if (confirmedExitType === 'clock_out') {
      router.replace('/app/home')
    } else if (confirmedExitType === 'break') {
      setBreakStartIso(new Date().toISOString())
      setScreen('break')
    }
  }

  // ── Cancel exit ──
  function handleCancelExit() {
    setExitCode('') // clear code from memory
    setScreen('focus')
  }

  // ── Send message ──
  async function sendMessage() {
    if (!msgInput.trim()) return
    setSending(true)
    try {
      const msg = await api.staff.sendMessage(msgInput.trim())
      setMessages(prev => [msg, ...prev].slice(0, 10))
      setMsgInput('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  const contacts = policy?.emergency_contacts ?? []

  // ── Auto clock-out overlay ──
  if (autoClockOutReason) {
    return <AutoClockOutOverlay reason={autoClockOutReason} />
  }

  // ── Loading screen ──
  if (screen === 'loading') {
    return (
      <div className="fixed inset-0 bg-[#020617] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-[#16a34a] rounded-full animate-spin" />
      </div>
    )
  }

  // ── Exit code screen ──
  if (screen === 'exit-request') {
    return (
      <ExitCodeScreen
        exitType={exitType}
        exitCode={exitCode}
        onCancel={handleCancelExit}
        onSuccess={handleExitConfirmed}
      />
    )
  }

  // ── Break screen ──
  if (screen === 'break') {
    return (
      <BreakScreen
        breakStartIso={breakStartIso ?? new Date().toISOString()}
        now={now}
        onReturn={() => setScreen('focus')}
      />
    )
  }

  // ── Focus Mode screen ──
  return (
    <div className="fixed inset-0 bg-[#020617] flex flex-col overflow-hidden">
      {/* One-time phone lock setup wizard */}
      {/* Biometric verify overlay for exit */}
      {exitBiometricState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-6">
          <div className="bg-[#0f172a] border border-white/10 rounded-2xl p-8 w-full max-w-sm text-center">
            <div className="w-8 h-8 border-2 border-white/20 border-t-[#16a34a] rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white text-base font-semibold">Verify your identity to exit</p>
            <p className="text-[#94a3b8] text-sm mt-2">Follow your device prompt</p>
          </div>
        </div>
      )}

      {/* Focus return banner */}
      {focusBanner && (
        <div className="absolute top-0 left-0 right-0 z-40 bg-amber-500 text-white text-center py-3 text-sm font-semibold">
          Refocus — you left the app
        </div>
      )}

      {/* Emergency overlay */}
      {showEmergency && (
        <EmergencyOverlay contacts={contacts} onClose={() => setShowEmergency(false)} />
      )}

      {/* Top bar */}
      <div className="flex-none flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div>
          <p className="text-white text-sm font-semibold truncate max-w-[180px]">{tenantName}</p>
          {displayName && (
            <p className="text-[#22c55e] text-xs mt-0.5 truncate max-w-[180px]">
              {(() => { const h = now.getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' })()}, {displayName}
            </p>
          )}
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[#94a3b8] text-xs font-mono">
              SHIFT ACTIVE {shiftStart ? shiftDuration(shiftStart) : '--:--:--'}
            </span>
          </div>
        </div>
        <button
          onClick={() => requestExit('clock_out')}
          disabled={requestingExit}
          className="text-[#64748b] hover:text-[#94a3b8] text-xs border border-white/10 px-3 py-1.5 rounded-lg transition-colors"
        >
          PIN
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4 space-y-4">
        {error && (
          <div className="bg-red-900/30 border border-red-700/40 rounded-xl px-4 py-3 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Clock */}
        <div className="text-center py-2">
          <p className="text-white text-4xl font-bold font-mono tabular-nums">{formatClock(now)}</p>
          <p className="text-[#64748b] text-xs mt-1">{formatDateLong(now)}</p>
        </div>

        {/* Metrics row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Orders', value: live ? String(live.today_orders) : '--' },
            { label: 'Revenue', value: live ? `$${live.today_revenue.toFixed(0)}` : '--' },
            { label: 'Staff', value: live ? String(live.on_shift_count) : '--' },
          ].map(m => (
            <div key={m.label} className="bg-[#0f172a] border border-white/6 rounded-xl px-3 py-4 text-center">
              <p className="text-white text-xl font-bold">{m.value}</p>
              <p className="text-[#64748b] text-xs mt-1 leading-tight">{m.label}</p>
            </div>
          ))}
        </div>

        {/* Live orders */}
        {live && live.recent_orders.length > 0 && (
          <div className="bg-[#0f172a] border border-white/6 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <h2 className="text-white text-sm font-semibold">Live Orders</h2>
            </div>
            <div className="divide-y divide-white/5">
              {live.recent_orders.map(o => (
                <div key={o.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-white/8 text-[#94a3b8] capitalize">
                      {o.order_source || 'walk-in'}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${
                      o.status === 'completed' ? 'bg-green-900/40 text-green-400' :
                      o.status === 'pending' ? 'bg-amber-900/40 text-amber-400' :
                      'bg-white/5 text-[#94a3b8]'
                    }`}>
                      {o.status}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-white text-sm font-semibold">${(o.total ?? 0).toFixed(2)}</p>
                    <p className="text-[#64748b] text-xs">{elapsedSince(o.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Daily goals */}
        {live && live.goals.length > 0 && (
          <div className="bg-[#0f172a] border border-white/6 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5">
              <h2 className="text-white text-sm font-semibold">Today&apos;s Goals</h2>
            </div>
            <div className="px-4 py-4 space-y-4">
              {live.goals.map(g => {
                const pct = Math.min(100, g.target_value > 0 ? Math.round((g.current_value / g.target_value) * 100) : 0)
                const barColor = pct >= 80 ? '#22c55e' : pct >= 50 ? '#eab308' : accent
                return (
                  <div key={g.id}>
                    <div className="flex justify-between items-baseline mb-2">
                      <p className="text-white text-xs font-medium">{g.title}</p>
                      <p className="text-[#94a3b8] text-xs">{g.current_value} / {g.target_value} {g.metric}</p>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, backgroundColor: barColor }}
                      />
                    </div>
                    <p className="text-[#64748b] text-xs mt-1 text-right">{pct}%</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Team Chat */}
        <div className="bg-[#0f172a] border border-white/6 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-white text-sm font-semibold">Team Chat</h2>
              <span className="text-[#64748b] text-xs">View All</span>
            </div>
            <button
              onClick={() => router.push('/app/messages')}
              className="text-xs font-medium px-2.5 py-1 rounded-lg border border-white/10 text-white hover:border-white/25 transition-colors"
            >
              Open Full Chat
            </button>
          </div>

          <div className="px-4 py-3 space-y-3 max-h-56 overflow-y-auto">
            {messages.length === 0 ? (
              <p className="text-[#64748b] text-sm text-center py-4">No messages yet</p>
            ) : (
              [...messages].slice(0, 3).reverse().map(m => (
                <div key={m.id} className="space-y-1">
                  <p className="text-[#64748b] text-xs">
                    {m.from_name} &middot; {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <div className="bg-white/5 rounded-xl px-3 py-2 text-sm text-white leading-relaxed">
                    {displayContent(m.content)}
                  </div>
                </div>
              ))
            )}
            <div ref={msgBottomRef} />
          </div>

          <div className="px-4 py-3 border-t border-white/5 flex gap-2">
            <input
              type="text"
              placeholder="Message team..."
              value={msgInput}
              onChange={e => setMsgInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-white/20"
            />
            <button
              onClick={sendMessage}
              disabled={sending || !msgInput.trim()}
              className="px-4 py-2.5 text-white text-sm font-medium rounded-xl disabled:opacity-40 transition-opacity"
              style={{ backgroundColor: accent }}
            >
              Send
            </button>
          </div>
        </div>

        {/* Spacer for bottom bar */}
        <div className="h-4" />
      </div>

      {/* Bottom bar */}
      <div className="flex-none px-4 py-4 border-t border-white/5 flex gap-3">
        <button
          onClick={() => setShowEmergency(true)}
          className="px-4 py-4 bg-red-900/20 border border-red-900/40 text-red-400 text-sm font-semibold rounded-xl transition-colors active:bg-red-900/40 whitespace-nowrap"
        >
          Emergency
        </button>
        <button
          onClick={() => requestExit('break')}
          disabled={requestingExit}
          className="flex-1 py-4 bg-white/8 border border-white/10 text-white text-sm font-semibold rounded-xl transition-colors active:bg-white/15 disabled:opacity-50"
        >
          Break
        </button>
        <button
          onClick={() => requestExit('clock_out')}
          disabled={requestingExit}
          className="flex-1 py-4 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl transition-colors active:scale-[0.98] disabled:opacity-50"
        >
          {requestingExit ? '...' : 'Clock Out'}
        </button>
      </div>

      {/* Hidden slug storage (for chat passphrase key) */}
      <span className="hidden" data-slug={tenantSlug} />
    </div>
  )
}
