'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { api, StaffPolicy, LiveData, StaffMessage } from '@/lib/api'

// ─── Crypto helpers ───────────────────────────────────────────────────────────

async function deriveKey(passphrase: string, salt: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(salt || 'careful-server-salt'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

async function encryptMsg(text: string, key: CryptoKey): Promise<string> {
  const enc = new TextEncoder()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text))
  const buf = new Uint8Array(iv.byteLength + ct.byteLength)
  buf.set(iv, 0); buf.set(new Uint8Array(ct), iv.byteLength)
  return btoa(String.fromCharCode(...buf))
}

async function decryptMsg(b64: string, key: CryptoKey): Promise<string> {
  try {
    const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    const iv = buf.slice(0, 12)
    const ct = buf.slice(12)
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
    return new TextDecoder().decode(pt)
  } catch { return '[encrypted]' }
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

// ─── PIN Keypad modal ─────────────────────────────────────────────────────────

function PinModal({ onSuccess, onCancel, correctPin }: { onSuccess: () => void; onCancel: () => void; correctPin: string }) {
  const [digits, setDigits] = useState('')
  const [shake, setShake] = useState(false)
  const [error, setError] = useState('')

  function press(d: string) {
    if (digits.length >= 8) return
    const next = digits + d
    setDigits(next)
    setError('')
    if (next.length >= correctPin.length) {
      if (next === correctPin) {
        onSuccess()
      } else {
        setShake(true)
        setError('Incorrect PIN')
        setTimeout(() => { setShake(false); setDigits('') }, 700)
      }
    }
  }

  function del() {
    setDigits(d => d.slice(0, -1))
    setError('')
  }

  const keys = ['1','2','3','4','5','6','7','8','9','','0','DEL']

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-[#0f172a] border border-white/10 rounded-2xl p-8 w-80 max-w-[90vw]">
        <h2 className="text-white text-xl font-bold text-center mb-2">Exit Focus Mode</h2>
        <p className="text-[#94a3b8] text-sm text-center mb-6">Enter your manager PIN to exit</p>

        {/* Dots */}
        <div className={`flex justify-center gap-3 mb-6 transition-all ${shake ? 'animate-bounce' : ''}`}>
          {Array.from({ length: Math.max(4, correctPin.length) }).map((_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full border-2 transition-colors ${i < digits.length ? 'bg-white border-white' : 'border-white/30 bg-transparent'}`}
            />
          ))}
        </div>

        {error && <p className="text-red-400 text-sm text-center mb-4">{error}</p>}

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {keys.map((k, i) => {
            if (k === '') return <div key={i} />
            return (
              <button
                key={i}
                onClick={() => k === 'DEL' ? del() : press(k)}
                className={`h-14 rounded-xl text-lg font-semibold transition-colors active:scale-95 ${
                  k === 'DEL'
                    ? 'text-red-400 bg-white/5 hover:bg-white/10'
                    : 'text-white bg-white/10 hover:bg-white/20'
                }`}
              >
                {k}
              </button>
            )
          })}
        </div>

        <button
          onClick={onCancel}
          className="w-full py-3 rounded-xl text-[#94a3b8] text-sm hover:text-white transition-colors border border-white/10 hover:border-white/20"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Clock-out confirm modal ───────────────────────────────────────────────────

function ClockOutModal({ onConfirm, onCancel, loading }: { onConfirm: () => void; onCancel: () => void; loading: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#0f172a] border border-white/10 rounded-t-2xl p-6 w-full max-w-sm mb-0">
        <h2 className="text-white text-lg font-bold mb-1">End Shift?</h2>
        <p className="text-[#94a3b8] text-sm mb-6">This will clock you out and end Focus Mode.</p>
        <button
          onClick={onConfirm}
          disabled={loading}
          className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl mb-3 disabled:opacity-50 transition-colors text-base"
        >
          {loading ? 'Clocking Out...' : 'Yes, Clock Out'}
        </button>
        <button
          onClick={onCancel}
          className="w-full py-3 text-[#94a3b8] hover:text-white text-sm transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Emergency overlay ────────────────────────────────────────────────────────

function EmergencyOverlay({ contacts, onClose }: { contacts: { name: string; phone: string; relation: string }[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-[#0f172a] border border-red-900/50 rounded-2xl p-6 w-80 max-w-[90vw]">
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

// ─── Main kiosk page ──────────────────────────────────────────────────────────

type Screen = 'loading' | 'passphrase' | 'clock-in' | 'focus'

export default function KioskPage() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug ?? ''
  const searchParams = useSearchParams()
  const accentParam = searchParams?.get('accent')

  // Derive accent color — default green
  const accent = accentParam ? `#${accentParam.replace('#', '')}` : '#16a34a'

  // ── State ──
  const [screen, setScreen] = useState<Screen>('loading')
  const [policy, setPolicy] = useState<StaffPolicy | null>(null)
  const [live, setLive] = useState<LiveData | null>(null)
  const [messages, setMessages] = useState<StaffMessage[]>([])
  const [decryptedMsgs, setDecryptedMsgs] = useState<Record<number, string>>({})
  const [shiftStart, setShiftStart] = useState<string | null>(null)
  const [now, setNow] = useState(new Date())
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null)
  const [passphraseInput, setPassphraseInput] = useState('')
  const [passphraseError, setPassphraseError] = useState('')
  const [msgInput, setMsgInput] = useState('')
  const [sending, setSending] = useState(false)
  const [clockingIn, setClockinIn] = useState(false)
  const [clockingOut, setClockingOut] = useState(false)
  const [showPinModal, setShowPinModal] = useState(false)
  const [showClockOutConfirm, setShowClockOutConfirm] = useState(false)
  const [showEmergency, setShowEmergency] = useState(false)
  const [focusBanner, setFocusBanner] = useState(false)
  const [error, setError] = useState('')
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const msgBottomRef = useRef<HTMLDivElement>(null)

  // ── Clock tick ──
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(iv)
  }, [])

  // ── Fullscreen + security ──
  useEffect(() => {
    try { document.documentElement.requestFullscreen() } catch {}
    const noCtx = (e: MouseEvent) => e.preventDefault()
    document.addEventListener('contextmenu', noCtx)
    const noKeys = (e: KeyboardEvent) => {
      if (e.key === 'F12') { e.preventDefault(); return }
      if ((e.ctrlKey || e.metaKey) && ['r','w','t','l','n'].includes(e.key.toLowerCase())) {
        e.preventDefault()
      }
    }
    document.addEventListener('keydown', noKeys)
    return () => {
      document.removeEventListener('contextmenu', noCtx)
      document.removeEventListener('keydown', noKeys)
    }
  }, [])

  // ── Focus exit tracking ──
  useEffect(() => {
    if (screen !== 'focus') return
    function handleVisibility() {
      if (document.hidden) {
        api.staff.focusExit().catch(() => {})
      } else {
        setFocusBanner(true)
        if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current)
        bannerTimerRef.current = setTimeout(() => setFocusBanner(false), 3000)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [screen])

  // ── Initial load ──
  const load = useCallback(async () => {
    try {
      const [p, shift] = await Promise.all([api.staff.getPolicy(), api.staff.currentShift()])
      setPolicy(p)
      if (shift) setShiftStart(shift.clocked_in_at)

      // Check localStorage for passphrase
      const stored = typeof window !== 'undefined' ? localStorage.getItem(`cs_kiosk_passphrase_${slug}`) : null
      if (stored) {
        const salt = p.chat_salt || 'careful-server-salt'
        try {
          const key = await deriveKey(stored, salt)
          setCryptoKey(key)
          setScreen(shift ? 'focus' : 'clock-in')
        } catch {
          setScreen('passphrase')
        }
      } else {
        setScreen('passphrase')
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load')
      setScreen('clock-in')
    }
  }, [slug])

  useEffect(() => { load() }, [load])

  // ── Live data polling ──
  useEffect(() => {
    if (screen !== 'focus') return
    const fetchLive = async () => {
      try {
        const data = await api.staff.getLive()
        setLive(data)
      } catch {}
    }
    fetchLive()
    const iv = setInterval(fetchLive, 15000)
    return () => clearInterval(iv)
  }, [screen])

  // ── Message polling ──
  useEffect(() => {
    if (screen !== 'focus') return
    const fetchMsgs = async () => {
      try {
        const msgs = await api.staff.getMessages()
        setMessages(msgs.slice(0, 10))
      } catch {}
    }
    fetchMsgs()
    const iv = setInterval(fetchMsgs, 20000)
    return () => clearInterval(iv)
  }, [screen])

  // ── Decrypt messages when key or messages change ──
  useEffect(() => {
    if (!cryptoKey) return
    const decrypt = async () => {
      const results: Record<number, string> = {}
      for (const m of messages) {
        results[m.id] = await decryptMsg(m.content, cryptoKey)
      }
      setDecryptedMsgs(results)
    }
    decrypt()
  }, [messages, cryptoKey])

  // ── Scroll chat to bottom ──
  useEffect(() => {
    msgBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [decryptedMsgs])

  // ── Passphrase submit ──
  async function submitPassphrase() {
    if (!passphraseInput.trim()) return
    setPassphraseError('')
    try {
      const salt = policy?.chat_salt || 'careful-server-salt'
      const key = await deriveKey(passphraseInput.trim(), salt)
      localStorage.setItem(`cs_kiosk_passphrase_${slug}`, passphraseInput.trim())
      setCryptoKey(key)
      const shift = await api.staff.currentShift()
      if (shift) setShiftStart(shift.clocked_in_at)
      setScreen(shift ? 'focus' : 'clock-in')
    } catch (e: unknown) {
      setPassphraseError(e instanceof Error ? e.message : 'Failed to derive key')
    }
  }

  // ── Clock in ──
  async function clockIn() {
    setClockinIn(true)
    setError('')
    try {
      const shift = await api.staff.clockIn()
      setShiftStart(shift.clocked_in_at)
      const [liveData, msgs] = await Promise.all([api.staff.getLive(), api.staff.getMessages()])
      setLive(liveData)
      setMessages(msgs.slice(0, 10))
      setScreen('focus')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to clock in')
    } finally {
      setClockinIn(false)
    }
  }

  // ── Clock out ──
  async function clockOut() {
    setClockingOut(true)
    setError('')
    try {
      await api.staff.clockOut()
      setShiftStart(null)
      setLive(null)
      setMessages([])
      setDecryptedMsgs({})
      setShowClockOutConfirm(false)
      setScreen('clock-in')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to clock out')
      setShowClockOutConfirm(false)
    } finally {
      setClockingOut(false)
    }
  }

  // ── Send message ──
  async function sendMessage() {
    if (!msgInput.trim() || !cryptoKey) return
    setSending(true)
    try {
      const ciphertext = await encryptMsg(msgInput.trim(), cryptoKey)
      const msg = await api.staff.sendMessage(ciphertext)
      // Decrypt our own message immediately
      const plain = msgInput.trim()
      setMessages(prev => [msg, ...prev].slice(0, 10))
      setDecryptedMsgs(prev => ({ ...prev, [msg.id]: plain }))
      setMsgInput('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  const contacts = policy?.emergency_contacts ?? []
  const kioskPin = policy?.kiosk_pin ?? '1234'

  // ── Loading screen ──
  if (screen === 'loading') {
    return (
      <div className="fixed inset-0 bg-[#020617] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 rounded-full animate-spin" style={{ borderTopColor: accent }} />
      </div>
    )
  }

  // ── Passphrase screen ──
  if (screen === 'passphrase') {
    return (
      <div className="fixed inset-0 bg-[#020617] flex flex-col items-center justify-center px-6">
        {/* Logo / branding */}
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center text-white text-3xl font-bold mb-6 shadow-lg"
          style={{ backgroundColor: accent }}
        >
          CS
        </div>
        <h1 className="text-white text-2xl font-bold text-center mb-2">Work App</h1>
        <p className="text-[#94a3b8] text-sm text-center mb-10 max-w-xs">
          Enter your team passphrase to access the work app
        </p>

        <div className="w-full max-w-xs space-y-4">
          <input
            type="text"
            placeholder="Team passphrase"
            value={passphraseInput}
            onChange={e => { setPassphraseInput(e.target.value); setPassphraseError('') }}
            onKeyDown={e => { if (e.key === 'Enter') submitPassphrase() }}
            autoCapitalize="none"
            autoCorrect="off"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white placeholder-white/30 text-base focus:outline-none focus:border-white/30 focus:bg-white/8"
          />
          {passphraseError && (
            <p className="text-red-400 text-sm text-center">{passphraseError}</p>
          )}
          <button
            onClick={submitPassphrase}
            disabled={!passphraseInput.trim()}
            className="w-full py-4 text-white text-base font-semibold rounded-xl disabled:opacity-40 transition-opacity active:scale-[0.98]"
            style={{ backgroundColor: accent }}
          >
            Join Team
          </button>
        </div>

        <p className="text-[#64748b] text-xs text-center mt-8 max-w-xs">
          Contact your manager if you do not have the passphrase
        </p>
      </div>
    )
  }

  // ── Clock-in screen ──
  if (screen === 'clock-in') {
    return (
      <div className="fixed inset-0 bg-[#020617] flex flex-col">
        {/* Main content */}
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center text-white text-3xl font-bold mb-8 shadow-lg"
            style={{ backgroundColor: accent }}
          >
            CS
          </div>

          <p className="text-[#94a3b8] text-base mb-2">You are off the clock</p>
          <p className="text-white text-6xl font-bold font-mono tabular-nums mb-1 tracking-tight">
            {formatClock(now)}
          </p>
          <p className="text-[#64748b] text-sm mb-10">{formatDateLong(now)}</p>

          {error && (
            <div className="bg-red-900/40 border border-red-700/50 rounded-xl px-4 py-3 text-red-300 text-sm mb-6 w-full max-w-xs text-center">
              {error}
            </div>
          )}

          <button
            onClick={clockIn}
            disabled={clockingIn}
            className="w-full max-w-xs py-5 text-white text-xl font-bold rounded-2xl shadow-lg disabled:opacity-50 transition-all active:scale-[0.98]"
            style={{ backgroundColor: accent }}
          >
            {clockingIn ? 'Clocking In...' : 'Clock In'}
          </button>
        </div>

        {/* Emergency section */}
        <div className="px-6 pb-8 space-y-3">
          <p className="text-[#64748b] text-xs text-center font-semibold uppercase tracking-wide">Emergency</p>
          <a
            href="tel:911"
            className="flex items-center justify-center w-full py-3 bg-red-600/20 border border-red-700/40 text-red-400 font-bold rounded-xl text-base active:bg-red-600/40 transition-colors"
          >
            Call 911
          </a>
          {contacts.map((c, i) => (
            <a
              key={i}
              href={`tel:${c.phone}`}
              className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-3"
            >
              <div>
                <p className="text-white text-sm font-medium">{c.name}</p>
                <p className="text-[#94a3b8] text-xs">{c.relation}</p>
              </div>
              <span className="text-red-400 text-sm font-semibold">{c.phone}</span>
            </a>
          ))}
        </div>
      </div>
    )
  }

  // ── Focus Mode screen ──
  return (
    <div className="fixed inset-0 bg-[#020617] flex flex-col overflow-hidden">
      {/* Focus return banner */}
      {focusBanner && (
        <div className="absolute top-0 left-0 right-0 z-40 bg-amber-500 text-white text-center py-3 text-sm font-semibold animate-pulse">
          Focus Mode: Return to work app
        </div>
      )}

      {/* Modals */}
      {showPinModal && (
        <PinModal
          correctPin={kioskPin}
          onSuccess={() => {
            setShowPinModal(false)
            // Exit fullscreen and go to portal
            try { document.exitFullscreen() } catch {}
            window.location.href = `/portal/${slug}/dashboard`
          }}
          onCancel={() => setShowPinModal(false)}
        />
      )}
      {showClockOutConfirm && (
        <ClockOutModal
          onConfirm={clockOut}
          onCancel={() => setShowClockOutConfirm(false)}
          loading={clockingOut}
        />
      )}
      {showEmergency && (
        <EmergencyOverlay contacts={contacts} onClose={() => setShowEmergency(false)} />
      )}

      {/* Top bar */}
      <div className="flex-none flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-white text-sm font-semibold">SHIFT ACTIVE</span>
        </div>
        <div className="flex-1 text-center">
          <span className="text-[#94a3b8] text-xs font-mono tabular-nums">
            {shiftStart ? shiftDuration(shiftStart) : '--:--:--'}
          </span>
        </div>
        <button
          onClick={() => setShowPinModal(true)}
          className="text-[#64748b] hover:text-[#94a3b8] text-xs border border-white/10 px-3 py-1.5 rounded-lg transition-colors"
        >
          Exit
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
            { label: 'Orders Today', value: live ? String(live.today_orders) : '--' },
            { label: 'Revenue', value: live ? `$${live.today_revenue.toFixed(2)}` : '--' },
            { label: 'On Shift', value: live ? String(live.on_shift_count) : '--' },
          ].map(m => (
            <div key={m.label} className="bg-[#0f172a] border border-white/6 rounded-xl px-3 py-4 text-center">
              <p className="text-white text-xl font-bold">{m.value}</p>
              <p className="text-[#64748b] text-xs mt-1 leading-tight">{m.label}</p>
            </div>
          ))}
        </div>

        {/* Live order feed */}
        {live && live.recent_orders.length > 0 && (
          <div className="bg-[#0f172a] border border-white/6 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <h2 className="text-white text-sm font-semibold">Live Orders</h2>
            </div>
            <div className="divide-y divide-white/5">
              {live.recent_orders.map((o) => (
                <div key={o.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-white/8 text-[#94a3b8] capitalize">
                      {o.order_source || 'walk-in'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-md text-xs font-medium capitalize ${
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
              <h2 className="text-white text-sm font-semibold">Daily Goals</h2>
            </div>
            <div className="px-4 py-3 space-y-4">
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
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-green-900/30 text-green-400">
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                E2E
              </span>
            </div>
            <span className="text-[#64748b] text-xs">Updates every 20s</span>
          </div>

          {/* Messages */}
          <div className="px-4 py-3 space-y-3 max-h-56 overflow-y-auto">
            {messages.length === 0 ? (
              <p className="text-[#64748b] text-sm text-center py-4">No messages yet</p>
            ) : (
              [...messages].reverse().map(m => {
                const text = decryptedMsgs[m.id] ?? '...'
                return (
                  <div key={m.id} className="space-y-1">
                    <p className="text-[#64748b] text-xs">{m.from_name} &middot; {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    <div className="bg-white/5 rounded-xl px-3 py-2 text-sm text-white leading-relaxed">
                      {text}
                    </div>
                  </div>
                )
              })
            )}
            <div ref={msgBottomRef} />
          </div>

          {/* Input */}
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
              disabled={sending || !msgInput.trim() || !cryptoKey}
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
          className="px-4 py-4 bg-red-900/20 border border-red-900/40 text-red-400 text-sm font-semibold rounded-xl transition-colors active:bg-red-900/40"
        >
          Emergency
        </button>
        <button
          onClick={() => setShowClockOutConfirm(true)}
          className="flex-1 py-4 bg-red-600 hover:bg-red-700 text-white text-base font-bold rounded-xl transition-colors active:scale-[0.98]"
        >
          Clock Out
        </button>
      </div>
    </div>
  )
}
