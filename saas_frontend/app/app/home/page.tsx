'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api, PortalDashboard, BusinessGoal, StaffPolicy } from '@/lib/api'

function greeting(email: string): string {
  const hour = new Date().getHours()
  const name = email.split('@')[0]
  const period = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  return `Good ${period}, ${name}`
}

function formatClock(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatDateLong(d: Date): string {
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
}

// ─── Focus Mode Confirm Modal ─────────────────────────────────────────────────

function FocusModeModal({
  onConfirm,
  onCancel,
  loading,
}: {
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-6">
      <div className="bg-[#0f172a] border border-white/10 rounded-2xl p-8 w-full max-w-sm">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-[#16a34a]/20 border border-[#16a34a]/30 flex items-center justify-center">
            <svg className="w-8 h-8 text-[#16a34a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
        </div>

        <h2 className="text-white text-xl font-bold text-center mb-2">Focus Mode</h2>
        <p className="text-[#94a3b8] text-sm text-center mb-6 leading-relaxed">
          You are about to start your shift.
        </p>

        <div className="bg-white/5 border border-white/8 rounded-xl px-4 py-4 mb-6 space-y-3">
          <p className="text-[#94a3b8] text-sm leading-relaxed">
            While on the clock, your phone will enter Focus Mode — only work features will be accessible until you clock out.
          </p>
          <p className="text-[#94a3b8] text-sm leading-relaxed">
            Your manager will need to provide an exit code to end your shift or take a break.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-3 rounded-xl border border-white/10 text-[#94a3b8] text-sm font-medium hover:border-white/20 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-3 rounded-xl bg-[#16a34a] hover:bg-[#15803d] text-white text-sm font-bold transition-colors disabled:opacity-50"
          >
            {loading ? 'Starting...' : 'Start Shift'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AppHomePage() {
  const router = useRouter()
  const [now, setNow] = useState(new Date())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dashboard, setDashboard] = useState<PortalDashboard | null>(null)
  const [goals, setGoals] = useState<BusinessGoal[]>([])
  const [policy, setPolicy] = useState<StaffPolicy | null>(null)
  const [userEmail, setUserEmail] = useState('')
  const [showFocusModal, setShowFocusModal] = useState(false)
  const [clockingIn, setClockingIn] = useState(false)

  // Live clock
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(iv)
  }, [])

  const load = useCallback(async () => {
    // Token guard
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    if (!token) {
      router.replace('/app/login')
      return
    }

    try {
      const [dash, shift, dailyGoals, pol] = await Promise.all([
        api.portal.dashboard(),
        api.staff.currentShift(),
        api.staff.getGoals(),
        api.staff.getPolicy(),
      ])

      // Already clocked in → go straight to kiosk
      if (shift) {
        router.replace('/app/kiosk')
        return
      }

      setDashboard(dash as unknown as PortalDashboard)
      // Filter to only daily goals
      setGoals((dailyGoals as BusinessGoal[]).filter(g => g.period === 'daily' && g.is_active))
      setPolicy(pol)

      // Decode email from JWT
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        setUserEmail(payload.sub || payload.email || '')
      } catch {
        setUserEmail('')
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load'
      // 401 handling: the api helper clears the token and redirects to /login,
      // but we want to redirect to /app/login instead.
      if (msg.includes('Session expired') || !localStorage.getItem('token')) {
        router.replace('/app/login')
        return
      }
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    load()
  }, [load])

  function signOut() {
    localStorage.removeItem('token')
    router.replace('/app/login')
  }

  async function handleStartShift() {
    setClockingIn(true)
    try {
      await api.staff.clockIn()
      router.push('/app/kiosk')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to clock in'
      setError(msg)
      setShowFocusModal(false)
    } finally {
      setClockingIn(false)
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#020617] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-[#16a34a] rounded-full animate-spin" />
      </div>
    )
  }

  const tenantName = dashboard?.tenant?.name ?? 'Careful Server'

  return (
    <div className="min-h-screen bg-[#020617] flex flex-col pb-24">
      {/* Focus mode modal */}
      {showFocusModal && (
        <FocusModeModal
          onConfirm={handleStartShift}
          onCancel={() => setShowFocusModal(false)}
          loading={clockingIn}
        />
      )}

      {/* Top bar */}
      <div className="flex items-center justify-between px-5 pt-12 pb-4">
        <div>
          <h1 className="text-white text-xl font-bold">{tenantName}</h1>
          <p className="text-[#64748b] text-xs mt-0.5">{formatDateLong(now)}</p>
        </div>
        <button
          onClick={signOut}
          className="text-[#64748b] text-xs border border-white/10 px-3 py-1.5 rounded-lg hover:text-white hover:border-white/20 transition-colors"
        >
          Sign out
        </button>
      </div>

      {/* Clock */}
      <div className="px-5 pb-6">
        <p className="text-white text-5xl font-bold font-mono tabular-nums tracking-tight">
          {formatClock(now)}
        </p>
        {userEmail && (
          <p className="text-[#94a3b8] text-sm mt-2">{greeting(userEmail)}</p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-5 mb-4 bg-red-950/60 border border-red-900/50 rounded-xl px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Today's Goals */}
      {goals.length > 0 && (
        <div className="mx-5 mb-5 bg-[#0f172a] border border-white/6 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5">
            <h2 className="text-white text-sm font-semibold">Today&apos;s Goals</h2>
          </div>
          <div className="px-4 py-4 space-y-5">
            {goals.map(g => {
              const pct = g.target_value > 0
                ? Math.min(100, Math.round((g.current_value / g.target_value) * 100))
                : 0
              const barColor = pct >= 80 ? '#22c55e' : pct >= 50 ? '#eab308' : '#16a34a'
              return (
                <div key={g.id}>
                  <div className="flex justify-between items-baseline mb-2">
                    <p className="text-white text-sm font-medium">{g.title}</p>
                    <p className="text-[#94a3b8] text-xs">
                      {g.current_value} / {g.target_value} {g.metric}
                    </p>
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

      {/* Emergency contacts */}
      {policy && policy.emergency_contacts.length > 0 && (
        <div className="mx-5 mb-5 bg-[#0f172a] border border-white/6 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5">
            <h2 className="text-white text-sm font-semibold">Emergency Contacts</h2>
          </div>
          <div className="px-4 py-3 space-y-2">
            {policy.emergency_contacts.map((c, i) => (
              <a
                key={i}
                href={`tel:${c.phone}`}
                className="flex items-center justify-between bg-white/5 border border-white/8 rounded-xl px-4 py-3 transition-colors active:bg-white/10"
              >
                <div>
                  <p className="text-white text-sm font-medium">{c.name}</p>
                  <p className="text-[#64748b] text-xs">{c.relation}</p>
                </div>
                <span className="text-[#16a34a] text-sm font-semibold">{c.phone}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Sticky Clock In button */}
      <div className="fixed bottom-0 left-0 right-0 px-5 pb-8 pt-4 bg-gradient-to-t from-[#020617] to-transparent">
        <button
          onClick={() => setShowFocusModal(true)}
          className="w-full bg-[#16a34a] hover:bg-[#15803d] text-white text-lg font-bold rounded-2xl h-16 shadow-lg transition-colors active:scale-[0.98]"
        >
          Clock In
        </button>
      </div>
    </div>
  )
}
