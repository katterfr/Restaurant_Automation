'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api, PortalDashboard, BusinessGoal, StaffPolicy } from '@/lib/api'
import { isBiometricAvailable, enrollBiometric, verifyBiometric } from '@/lib/webauthn'

function greeting(name: string): string {
  const hour = new Date().getHours()
  const period = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  return `Good ${period}, ${name}`
}

function formatClock(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatDateLong(d: Date): string {
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
}

// ─── Haversine distance ───────────────────────────────────────────────────────

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ─── Biometric enrollment modal ───────────────────────────────────────────────

function EnrollBiometricModal({
  onEnroll,
  onSkip,
  enrolling,
  enrollError,
}: {
  onEnroll: () => void
  onSkip: () => void
  enrolling: boolean
  enrollError: string
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-6">
      <div className="bg-[#0f172a] border border-white/10 rounded-2xl p-8 w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-[#16a34a]/20 border border-[#16a34a]/30 flex items-center justify-center">
            <svg className="w-8 h-8 text-[#16a34a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.864 4.243A7.5 7.5 0 0119.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 004.5 10.5a7.464 7.464 0 01-1.15 3.993m1.989 3.559A11.209 11.209 0 008.25 10.5a3.75 3.75 0 117.5 0c0 .527-.021 1.049-.064 1.565M12 10.5a14.94 14.94 0 01-3.6 9.75m6.633-4.596a18.666 18.666 0 01-2.485 5.33" />
            </svg>
          </div>
        </div>

        <h2 className="text-white text-xl font-bold text-center mb-2">Set Up Biometric Authentication</h2>
        <p className="text-[#94a3b8] text-sm text-center mb-6 leading-relaxed">
          Your identity will be verified each time you clock in or out. This uses your phone&apos;s built-in Face ID or fingerprint.
        </p>

        {enrollError && (
          <div className="bg-red-950/60 border border-red-900/50 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">
            {enrollError}
          </div>
        )}

        <button
          onClick={onEnroll}
          disabled={enrolling}
          className="w-full py-4 rounded-xl bg-[#16a34a] hover:bg-[#15803d] text-white text-sm font-bold transition-colors disabled:opacity-50 mb-3"
        >
          {enrolling ? 'Setting up...' : 'Tap to Enroll — Use Face ID / Fingerprint'}
        </button>
        <button
          onClick={onSkip}
          disabled={enrolling}
          className="w-full py-3 rounded-xl border border-white/10 text-[#94a3b8] text-sm font-medium hover:border-white/20 hover:text-white transition-colors"
        >
          Skip for Now
        </button>

        <p className="text-[#64748b] text-xs text-center mt-4">
          Skipping means anyone with access to this device can clock in as you.
        </p>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

type ClockinState = 'idle' | 'biometric' | 'clockin' | 'error'

export default function AppHomePage() {
  const router = useRouter()
  const [now, setNow] = useState(new Date())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dashboard, setDashboard] = useState<PortalDashboard | null>(null)
  const [goals, setGoals] = useState<BusinessGoal[]>([])
  const [policy, setPolicy] = useState<StaffPolicy | null>(null)
  const [userEmail, setUserEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [clockingIn, setClockingIn] = useState(false)

  // Biometric state
  const [biometricAvailable, setBiometricAvailable] = useState(false)
  const [biometricEnrolled, setBiometricEnrolled] = useState(false)
  const [showEnrollModal, setShowEnrollModal] = useState(false)
  const [enrolling, setEnrolling] = useState(false)
  const [enrollError, setEnrollError] = useState('')
  const [clockinState, setClockinState] = useState<ClockinState>('idle')

  // Geofencing state
  const [isInGeofence, setIsInGeofence] = useState<boolean | null>(null)
  const [geoPermDenied, setGeoPermDenied] = useState(false)

  // Live clock
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(iv)
  }, [])

  const load = useCallback(async () => {
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

      // Already clocked in -> go straight to kiosk
      if (shift) {
        router.replace('/app/kiosk')
        return
      }

      setDashboard(dash as unknown as PortalDashboard)
      setGoals((dailyGoals as BusinessGoal[]).filter(g => g.period === 'daily' && g.is_active))
      setPolicy(pol)

      // Decode name from JWT
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        const email = payload.sub || payload.email || ''
        setUserEmail(email)
        setDisplayName(payload.display_name || email.split('@')[0] || '')
      } catch {
        setUserEmail('')
      }

      // Check biometric availability
      const available = await isBiometricAvailable()
      setBiometricAvailable(available)
      if (available) {
        try {
          const status = await api.webauthn.status()
          setBiometricEnrolled(status.enrolled)
        } catch {
          setBiometricEnrolled(false)
        }
      }

      // Check geofence
      if (pol.geofence_enabled && pol.geofence_lat != null && pol.geofence_lng != null) {
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const dist = getDistanceMeters(
                pos.coords.latitude,
                pos.coords.longitude,
                pol.geofence_lat!,
                pol.geofence_lng!
              )
              setIsInGeofence(dist <= (pol.geofence_radius_m ?? 150))
            },
            () => {
              setGeoPermDenied(true)
              setIsInGeofence(null)
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
          )
        } else {
          setIsInGeofence(null)
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load'
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

  function handleClockInTap() {
    setError('')

    // Geofence check
    if (policy?.geofence_enabled && policy.geofence_lat != null && policy.geofence_lng != null) {
      if (isInGeofence === false) return // blocked — message shown below button
    }

    // If biometric available and not enrolled -> enroll first
    if (biometricAvailable && !biometricEnrolled) {
      setShowEnrollModal(true)
      return
    }

    doClockIn()
  }

  async function handleEnroll() {
    setEnrolling(true)
    setEnrollError('')
    try {
      await enrollBiometric()
      setBiometricEnrolled(true)
      setShowEnrollModal(false)
      doClockIn()
    } catch (e: unknown) {
      setEnrollError(e instanceof Error ? e.message : 'Enrollment failed')
    } finally {
      setEnrolling(false)
    }
  }

  function handleSkipEnroll() {
    setShowEnrollModal(false)
    doClockIn()
  }

  async function doClockIn() {
    setClockingIn(true)
    setClockinState('idle')
    try {
      if (biometricAvailable && biometricEnrolled) {
        setClockinState('biometric')
        await verifyBiometric()
      }
      setClockinState('clockin')
      await api.staff.clockIn()
      router.push('/app/kiosk')
    } catch (e: unknown) {
      setClockinState('error')
      const msg = e instanceof Error ? e.message : 'Failed to clock in'
      setError(msg)
    } finally {
      setClockingIn(false)
      setClockinState('idle')
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

  const geofenceEnabled = policy?.geofence_enabled && policy.geofence_lat != null && policy.geofence_lng != null
  const geofenceBlocked = geofenceEnabled && isInGeofence === false
  const geofenceVerified = geofenceEnabled && isInGeofence === true

  return (
    <div className="min-h-screen bg-[#020617] flex flex-col pb-24">
      {/* Biometric enrollment modal */}
      {showEnrollModal && (
        <EnrollBiometricModal
          onEnroll={handleEnroll}
          onSkip={handleSkipEnroll}
          enrolling={enrolling}
          enrollError={enrollError}
        />
      )}

      {/* Biometric verify overlay */}
      {clockinState === 'biometric' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-6">
          <div className="bg-[#0f172a] border border-white/10 rounded-2xl p-8 w-full max-w-sm text-center">
            <div className="w-8 h-8 border-2 border-white/20 border-t-[#16a34a] rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white text-base font-semibold">Verifying identity...</p>
            <p className="text-[#94a3b8] text-sm mt-2">Follow your device prompt</p>
          </div>
        </div>
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
          <p className="text-[#94a3b8] text-sm mt-2">{greeting(displayName || userEmail)}</p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-5 mb-4 bg-red-950/60 border border-red-900/50 rounded-xl px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Geofence permission denied warning */}
      {geoPermDenied && geofenceEnabled && (
        <div className="mx-5 mb-4 bg-amber-950/60 border border-amber-900/50 rounded-xl px-4 py-3 text-amber-400 text-sm">
          Location access was denied. If you have trouble clocking in, enable location permissions in your browser settings.
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
        {geofenceVerified && (
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            <span className="text-green-400 text-xs font-medium">Location verified</span>
          </div>
        )}

        <button
          onClick={handleClockInTap}
          disabled={clockingIn || geofenceBlocked}
          className="w-full bg-[#16a34a] hover:bg-[#15803d] text-white text-lg font-bold rounded-2xl h-16 shadow-lg transition-colors active:scale-[0.98] disabled:opacity-50"
        >
          {clockingIn ? 'Clocking In...' : 'Clock In'}
        </button>

        {geofenceBlocked && (
          <p className="text-[#94a3b8] text-xs text-center mt-3 px-4 leading-relaxed">
            You must be at the restaurant to clock in. Your current location is not recognized.
          </p>
        )}
      </div>
    </div>
  )
}
