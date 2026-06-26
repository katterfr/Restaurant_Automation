'use client'
import { useEffect, useState, useCallback, useContext, useRef } from 'react'
import { useParams } from 'next/navigation'
import { api, StaffPolicy, EmployeeShift, BusinessGoal, StaffMessage } from '@/lib/api'
import { getRole } from '@/lib/auth'
import { CustomizationContext } from '../tenant-context'

type ExitRequest = {
  id: number
  exit_type: string
  code: string
  status: string
  created_at: string
  expires_at: string
  user_email: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function elapsedMinutes(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
}

// ─── Owner view ───────────────────────────────────────────────────────────────

function generatePassphrase(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let result = ''
  const arr = crypto.getRandomValues(new Uint8Array(12))
  for (const b of arr) result += chars[b % chars.length]
  return result
}

function OwnerView({ accent }: { accent: string }) {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug ?? ''
  const [policy, setPolicy] = useState<StaffPolicy | null>(null)
  const [shifts, setShifts] = useState<EmployeeShift[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Exit requests
  const [exitRequests, setExitRequests] = useState<ExitRequest[]>([])
  const exitPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Add contact form
  const [contactForm, setContactForm] = useState({ name: '', phone: '', relation: '' })
  const [addingContact, setAddingContact] = useState(false)

  // Kiosk PIN
  const [kioskPinInput, setKioskPinInput] = useState('')
  const [savingPin, setSavingPin] = useState(false)

  // Chat passphrase
  const [passphraseInput, setPassphraseInput] = useState('')
  const [savingPassphrase, setSavingPassphrase] = useState(false)
  const [passphraseCopied, setPassphraseCopied] = useState(false)

  // Kiosk guide open/close
  const [guideOpen, setGuideOpen] = useState(false)

  const loadExitRequests = useCallback(async () => {
    try {
      const reqs = await api.staff.getExitRequests()
      setExitRequests(reqs)
    } catch { /* owner might not have permission yet */ }
  }, [])

  const load = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([api.staff.getPolicy(), api.staff.shifts()])
      setPolicy(p)
      setShifts(s)
      setKioskPinInput(p.kiosk_pin ?? '1234')
      setPassphraseInput(p.chat_salt ?? '')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    loadExitRequests()
    exitPollRef.current = setInterval(loadExitRequests, 10000)
    return () => {
      if (exitPollRef.current) clearInterval(exitPollRef.current)
    }
  }, [loadExitRequests])

  async function toggleEnabled() {
    if (!policy) return
    setSaving(true)
    try {
      const updated = await api.staff.updatePolicy({ enabled: !policy.enabled, emergency_contacts: policy.emergency_contacts })
      setPolicy(updated)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function addContact() {
    if (!policy || !contactForm.name || !contactForm.phone) return
    setAddingContact(true)
    try {
      const contacts = [...policy.emergency_contacts, contactForm]
      const updated = await api.staff.updatePolicy({ enabled: policy.enabled, emergency_contacts: contacts })
      setPolicy(updated)
      setContactForm({ name: '', phone: '', relation: '' })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to add contact')
    } finally {
      setAddingContact(false)
    }
  }

  async function removeContact(idx: number) {
    if (!policy) return
    const contacts = policy.emergency_contacts.filter((_, i) => i !== idx)
    try {
      const updated = await api.staff.updatePolicy({ enabled: policy.enabled, emergency_contacts: contacts })
      setPolicy(updated)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to remove contact')
    }
  }

  async function saveKioskPin() {
    if (!kioskPinInput.trim()) return
    setSavingPin(true)
    try {
      const updated = await api.staff.updatePolicy({ kiosk_pin: kioskPinInput.trim() })
      setPolicy(updated)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save PIN')
    } finally {
      setSavingPin(false)
    }
  }

  async function savePassphrase() {
    setSavingPassphrase(true)
    try {
      const updated = await api.staff.updatePolicy({ chat_salt: passphraseInput.trim() })
      setPolicy(updated)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save passphrase')
    } finally {
      setSavingPassphrase(false)
    }
  }

  function generateAndSetPassphrase() {
    setPassphraseInput(generatePassphrase())
  }

  async function copyPassphrase() {
    try {
      await navigator.clipboard.writeText(passphraseInput)
      setPassphraseCopied(true)
      setTimeout(() => setPassphraseCopied(false), 2000)
    } catch {}
  }

  const activeShifts = shifts.filter(s => !s.clocked_out_at)
  const recentShifts = shifts.slice(0, 20)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-gray-200 rounded-full animate-spin" style={{ borderTopColor: accent }} />
      </div>
    )
  }

  function minutesUntilExpiry(expiresAt: string): number {
    return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 60000))
  }

  function formatExitType(t: string): string {
    return t === 'clock_out' ? 'Clock Out' : 'Take a Break'
  }

  return (
    <div className="space-y-8">
      {/* Exit Requests */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          {exitRequests.length > 0 && (
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse flex-none" />
          )}
          <h2 className="text-base font-semibold text-gray-900">Pending Exit Requests</h2>
          {exitRequests.length > 0 && (
            <span className="ml-auto text-xs text-gray-400">{exitRequests.length} pending</span>
          )}
        </div>
        <div className="px-5 py-4">
          {exitRequests.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No pending exit requests</p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">Employees waiting for an exit code</p>
              {exitRequests.map(req => (
                <div key={req.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-green-50 border border-green-100 rounded-xl px-4 py-4">
                  <div className="space-y-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{req.user_email}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${
                        req.exit_type === 'clock_out'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {formatExitType(req.exit_type)}
                      </span>
                      <span className="text-xs text-gray-400">
                        Requested at {new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="text-xs text-gray-400">
                        &middot; Expires in {minutesUntilExpiry(req.expires_at)}m
                      </span>
                    </div>
                  </div>
                  <div className="flex-none">
                    <p className="text-xs text-gray-500 mb-1 text-center">Exit Code</p>
                    <p className="text-2xl font-bold font-mono tracking-[0.25em] text-green-700 bg-green-100 border border-green-200 rounded-xl px-4 py-2 text-center select-all">
                      {req.code}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Header + toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff Tools</h1>
          <p className="text-sm text-gray-500 mt-1">Clock-in system, emergency contacts, and shift tracking</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">{policy?.enabled ? 'Enabled' : 'Disabled'}</span>
          <button
            onClick={toggleEnabled}
            disabled={saving}
            className={`w-12 h-6 rounded-full transition-colors relative disabled:opacity-50 ${policy?.enabled ? '' : 'bg-gray-300'}`}
            style={policy?.enabled ? { backgroundColor: accent } : {}}
          >
            <span className={`block w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-transform ${policy?.enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Emergency Contacts */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Emergency Contacts</h2>
          <p className="text-xs text-gray-400 mt-0.5">Shown to staff during their shift</p>
        </div>
        <div className="px-5 py-4 space-y-3">
          {policy?.emergency_contacts.length === 0 && (
            <p className="text-sm text-gray-400 italic">No emergency contacts configured yet.</p>
          )}
          {policy?.emergency_contacts.map((c, i) => (
            <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-900">{c.name}</p>
                <p className="text-xs text-gray-500">{c.relation} &middot; <a href={`tel:${c.phone}`} className="hover:underline">{c.phone}</a></p>
              </div>
              <button
                onClick={() => removeContact(i)}
                className="text-xs text-red-400 hover:text-red-600 transition-colors ml-3"
              >
                Remove
              </button>
            </div>
          ))}

          {/* Add contact form */}
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <input
              type="text"
              placeholder="Name"
              value={contactForm.name}
              onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': accent } as React.CSSProperties}
            />
            <input
              type="tel"
              placeholder="Phone"
              value={contactForm.phone}
              onChange={e => setContactForm(f => ({ ...f, phone: e.target.value }))}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
            />
            <input
              type="text"
              placeholder="Relation"
              value={contactForm.relation}
              onChange={e => setContactForm(f => ({ ...f, relation: e.target.value }))}
              className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
            />
            <button
              onClick={addContact}
              disabled={addingContact || !contactForm.name || !contactForm.phone}
              className="px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ backgroundColor: accent }}
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Kiosk PIN */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Kiosk Exit PIN</h2>
          <p className="text-xs text-gray-400 mt-0.5">Employees must enter this PIN to exit Focus Mode</p>
        </div>
        <div className="px-5 py-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <input
            type="text"
            placeholder="1234"
            value={kioskPinInput}
            onChange={e => setKioskPinInput(e.target.value)}
            maxLength={8}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 w-32 font-mono"
          />
          <button
            onClick={saveKioskPin}
            disabled={savingPin || !kioskPinInput.trim()}
            className="px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-opacity hover:opacity-90"
            style={{ backgroundColor: accent }}
          >
            {savingPin ? 'Saving...' : 'Save PIN'}
          </button>
        </div>
      </div>

      {/* Team Chat Passphrase */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Team Chat Passphrase</h2>
          <p className="text-xs text-gray-400 mt-0.5">All employees must enter this passphrase once to access encrypted team chat. Share it with your staff when they set up the work app.</p>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              placeholder="Enter or generate passphrase"
              value={passphraseInput}
              onChange={e => setPassphraseInput(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 font-mono"
            />
            <button
              onClick={generateAndSetPassphrase}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors whitespace-nowrap"
            >
              Generate New
            </button>
            <button
              onClick={savePassphrase}
              disabled={savingPassphrase}
              className="px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ backgroundColor: accent }}
            >
              {savingPassphrase ? 'Saving...' : 'Save'}
            </button>
          </div>
          {passphraseInput && (
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-800 break-all">
                {passphraseInput}
              </code>
              <button
                onClick={copyPassphrase}
                className="shrink-0 px-3 py-2 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {passphraseCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Currently on shift */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <h2 className="text-base font-semibold text-gray-900">Currently On Shift</h2>
          <span className="ml-auto text-xs text-gray-400">{activeShifts.length} active</span>
        </div>
        <div className="px-5 py-4">
          {activeShifts.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No employees currently clocked in.</p>
          ) : (
            <div className="space-y-2">
              {activeShifts.map(s => (
                <div key={s.id} className="flex items-center justify-between bg-green-50 rounded-lg px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {(s as unknown as Record<string, string>)['user_name'] || (s as unknown as Record<string, string>)['user_email'] || `User #${s.user_id}`}
                    </p>
                    <p className="text-xs text-gray-500">Clocked in at {formatTime(s.clocked_in_at)}</p>
                  </div>
                  <span className="text-sm font-semibold text-green-700">
                    {formatDuration(elapsedMinutes(s.clocked_in_at))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent shifts table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Recent Shifts</h2>
        </div>
        {recentShifts.length === 0 ? (
          <div className="px-5 py-6 text-sm text-gray-400 italic">No shifts recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Employee</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Clocked In</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Clocked Out</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Duration</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Focus Exits</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentShifts.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-gray-900">
                      {(s as unknown as Record<string, string>)['user_name'] || (s as unknown as Record<string, string>)['user_email'] || `User #${s.user_id}`}
                    </td>
                    <td className="px-5 py-3 text-gray-600">{formatDate(s.clocked_in_at)} {formatTime(s.clocked_in_at)}</td>
                    <td className="px-5 py-3 text-gray-600">{s.clocked_out_at ? `${formatDate(s.clocked_out_at)} ${formatTime(s.clocked_out_at)}` : <span className="text-green-600 font-medium">Active</span>}</td>
                    <td className="px-5 py-3 text-gray-600">{s.duration_minutes != null ? formatDuration(s.duration_minutes) : s.clocked_out_at ? '—' : formatDuration(elapsedMinutes(s.clocked_in_at))}</td>
                    <td className="px-5 py-3 text-gray-600">{s.focus_exits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Kiosk Setup Guide */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <button
          onClick={() => setGuideOpen(o => !o)}
          className="w-full px-5 py-4 flex items-center justify-between text-left"
        >
          <div>
            <h2 className="text-base font-semibold text-gray-900">Kiosk Setup Guide</h2>
            <p className="text-xs text-gray-400 mt-0.5">How to set up Focus Mode on an employee&apos;s phone</p>
          </div>
          <span className="text-gray-400 text-lg">{guideOpen ? '▲' : '▼'}</span>
        </button>

        {guideOpen && (
          <div className="px-5 pb-6 space-y-5 border-t border-gray-100">
            {/* Kiosk URL */}
            <div className="pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Kiosk URL</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-800 break-all">
                  {typeof window !== 'undefined' ? `${window.location.origin}/portal/${slug}/kiosk` : `/portal/${slug}/kiosk`}
                </code>
                <button
                  onClick={() => {
                    const url = typeof window !== 'undefined' ? `${window.location.origin}/portal/${slug}/kiosk` : `/portal/${slug}/kiosk`
                    navigator.clipboard.writeText(url).catch(() => {})
                  }}
                  className="shrink-0 px-3 py-2 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>

            {/* iPhone */}
            <div>
              <p className="text-sm font-semibold text-gray-800 mb-2">iPhone (iOS)</p>
              <ol className="space-y-1 text-sm text-gray-600 list-decimal list-inside">
                <li>Open Safari on the employee&apos;s phone</li>
                <li>Go to the Kiosk URL above</li>
                <li>Tap the Share button &rarr; &ldquo;Add to Home Screen&rdquo; &rarr; Add</li>
                <li>Open the app from the Home Screen</li>
                <li>Go to Settings &rarr; Accessibility &rarr; Guided Access &rarr; Turn On</li>
                <li>Open the Careful Server work app</li>
                <li>Triple-click the side button to start Guided Access</li>
                <li>Set a Guided Access PIN &mdash; this locks the phone to the app</li>
              </ol>
            </div>

            {/* Android */}
            <div>
              <p className="text-sm font-semibold text-gray-800 mb-2">Android</p>
              <ol className="space-y-1 text-sm text-gray-600 list-decimal list-inside">
                <li>Open Chrome on the employee&apos;s phone</li>
                <li>Go to the Kiosk URL above</li>
                <li>Tap Menu &rarr; &ldquo;Add to Home Screen&rdquo;</li>
                <li>Open the app from the Home Screen</li>
                <li>Go to Settings &rarr; Biometrics and Security &rarr; Pin Windows (or Screen Pinning)</li>
                <li>Enable Screen Pinning</li>
                <li>Open the app &rarr; tap Recent Apps &rarr; tap the pin icon on the app card</li>
              </ol>
            </div>

            <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
              To unlock at end of shift: use the Guided Access PIN (iPhone) or Screen Pin PIN (Android)
            </p>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Enable this feature to allow employees to clock in and use Focus Mode. The Staff nav item appears for all portal users once enabled.
      </p>
    </div>
  )
}

// ─── Employee / Focus Mode view ───────────────────────────────────────────────

function EmployeeView({ accent }: { accent: string }) {
  const [shift, setShift] = useState<EmployeeShift | null | undefined>(undefined)
  const [policy, setPolicy] = useState<StaffPolicy | null>(null)
  const [goals, setGoals] = useState<BusinessGoal[]>([])
  const [messages, setMessages] = useState<StaffMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [clockingIn, setClockinIn] = useState(false)
  const [clockingOut, setClockingOut] = useState(false)
  const [error, setError] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [focusBanner, setFocusBanner] = useState(false)
  const [msgInput, setMsgInput] = useState('')
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([api.staff.currentShift(), api.staff.getPolicy()])
      setShift(s)
      setPolicy(p)
      if (s) {
        const [g, m] = await Promise.all([api.staff.getGoals(), api.staff.getMessages()])
        setGoals(g)
        setMessages(m.slice(0, 10))
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Real-time elapsed timer
  useEffect(() => {
    if (!shift) return
    const iv = setInterval(() => {
      setElapsed(elapsedMinutes(shift.clocked_in_at))
    }, 1000)
    return () => clearInterval(iv)
  }, [shift])

  // Focus exit tracking
  useEffect(() => {
    if (!shift) return
    function handleVisibility() {
      if (document.hidden) {
        api.staff.focusExit().catch(() => {})
        setFocusBanner(true)
        setTimeout(() => setFocusBanner(false), 5000)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [shift])

  // Poll messages every 30s during shift
  useEffect(() => {
    if (!shift) return
    const iv = setInterval(async () => {
      try {
        const m = await api.staff.getMessages()
        setMessages(m.slice(0, 10))
      } catch {}
    }, 30000)
    return () => clearInterval(iv)
  }, [shift])

  async function clockIn() {
    setClockinIn(true)
    setError('')
    try {
      const s = await api.staff.clockIn()
      setShift(s)
      const [g, m] = await Promise.all([api.staff.getGoals(), api.staff.getMessages()])
      setGoals(g)
      setMessages(m.slice(0, 10))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to clock in')
    } finally {
      setClockinIn(false)
    }
  }

  async function clockOut() {
    setClockingOut(true)
    setError('')
    try {
      await api.staff.clockOut()
      setShift(null)
      setGoals([])
      setMessages([])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to clock out')
    } finally {
      setClockingOut(false)
    }
  }

  async function sendMessage() {
    if (!msgInput.trim()) return
    setSending(true)
    try {
      const msg = await api.staff.sendMessage(msgInput.trim())
      setMessages(prev => [msg, ...prev].slice(0, 10))
      setMsgInput('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  if (loading || shift === undefined) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-gray-200 rounded-full animate-spin" style={{ borderTopColor: accent }} />
      </div>
    )
  }

  const contacts = policy?.emergency_contacts ?? []

  // ── Not clocked in ──
  if (!shift) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8">
        <div className="text-center space-y-2">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4"
            style={{ backgroundColor: accent }}
          >
            CS
          </div>
          <h1 className="text-2xl font-bold text-gray-900">You are off the clock</h1>
          <p className="text-sm text-gray-500">Clock in to start your shift and access Focus Mode.</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 w-full max-w-sm">{error}</div>
        )}

        <button
          onClick={clockIn}
          disabled={clockingIn}
          className="px-8 py-4 text-white text-lg font-semibold rounded-2xl shadow-lg disabled:opacity-50 hover:opacity-90 transition-opacity"
          style={{ backgroundColor: accent }}
        >
          {clockingIn ? 'Clocking In...' : 'Clock In'}
        </button>

        {contacts.length > 0 && (
          <div className="w-full max-w-sm space-y-3">
            <h2 className="text-sm font-semibold text-gray-700 text-center">Emergency Contacts</h2>
            {contacts.map((c, i) => (
              <a
                key={i}
                href={`tel:${c.phone}`}
                className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{c.name}</p>
                  <p className="text-xs text-gray-500">{c.relation}</p>
                </div>
                <span className="text-sm font-medium" style={{ color: accent }}>{c.phone}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Focus Mode (clocked in) ──
  return (
    <div className="space-y-6">
      {/* Focus banner */}
      {focusBanner && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-500 text-white text-center py-2 text-sm font-semibold">
          Focus Mode: Stay on this page during your shift
        </div>
      )}

      {/* Shift header */}
      <div
        className="rounded-2xl px-6 py-5 flex items-center justify-between"
        style={{ backgroundColor: `${accent}18`, borderLeft: `4px solid ${accent}` }}
      >
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Shift in Progress</p>
            <p className="text-2xl font-bold text-gray-900">{formatDuration(elapsed)}</p>
            <p className="text-xs text-gray-400">Since {formatTime(shift.clocked_in_at)}</p>
          </div>
        </div>
        <button
          onClick={clockOut}
          disabled={clockingOut}
          className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors"
        >
          {clockingOut ? 'Clocking Out...' : 'Clock Out'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Emergency section */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Emergency</h2>
        </div>
        <div className="px-5 py-4 space-y-3">
          <a
            href="tel:911"
            className="flex items-center justify-center gap-2 w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition-colors text-lg"
          >
            Call 911
          </a>
          {contacts.map((c, i) => (
            <a
              key={i}
              href={`tel:${c.phone}`}
              className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3 hover:bg-gray-100 transition-colors"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">{c.name}</p>
                <p className="text-xs text-gray-500">{c.relation}</p>
              </div>
              <span className="text-sm font-semibold text-red-600">{c.phone}</span>
            </a>
          ))}
        </div>
      </div>

      {/* Today's Goals */}
      {goals.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Today&apos;s Goals</h2>
          </div>
          <div className="px-5 py-4 space-y-4">
            {goals.map(g => {
              const pct = Math.min(100, g.target_value > 0 ? Math.round((g.current_value / g.target_value) * 100) : 0)
              return (
                <div key={g.id}>
                  <div className="flex justify-between items-baseline mb-1">
                    <p className="text-sm font-medium text-gray-900">{g.title}</p>
                    <p className="text-xs text-gray-500">{g.current_value} / {g.target_value} {g.metric}</p>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: accent }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 text-right">{pct}%</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Team Chat */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Team Chat</h2>
          <span className="text-xs text-gray-400">Updates every 30s</span>
        </div>
        <div className="px-5 py-4 space-y-3 max-h-64 overflow-y-auto flex flex-col-reverse">
          {messages.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No messages yet.</p>
          ) : (
            [...messages].reverse().map(m => (
              <div key={m.id} className="space-y-0.5">
                <p className="text-xs text-gray-400">{m.from_name} &middot; {formatTime(m.created_at)}</p>
                <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-800">{m.content}</div>
              </div>
            ))
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex gap-2">
          <input
            type="text"
            placeholder="Send a message to your team..."
            value={msgInput}
            onChange={e => setMsgInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
          />
          <button
            onClick={sendMessage}
            disabled={sending || !msgInput.trim()}
            className="px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 hover:opacity-90 transition-opacity"
            style={{ backgroundColor: accent }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StaffPage() {
  useParams<{ slug: string }>()
  const customization = useContext(CustomizationContext)
  const accent = customization.accent_color || '#16a34a'
  const role = getRole()
  const isOwner = role === 'owner' || role === 'admin'

  return isOwner ? <OwnerView accent={accent} /> : <EmployeeView accent={accent} />
}
