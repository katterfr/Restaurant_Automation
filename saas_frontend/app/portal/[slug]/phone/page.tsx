'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { api, PhoneStatus, PhoneAgent, PhoneCall } from '@/lib/api'
import { useCustomization } from '../tenant-context'

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function parseStructured(raw: string): { items: string; name: string; type: string } {
  try {
    const d = JSON.parse(raw)
    const items = (d.order_items || [])
      .map((i: { name: string; quantity: number }) => `${i.quantity}× ${i.name}`)
      .join(', ')
    return { items: items || '—', name: d.customer_name || '—', type: d.order_type || 'pickup' }
  } catch {
    return { items: '—', name: '—', type: 'pickup' }
  }
}

// ── Setup card (not yet activated) ────────────────────────────────────────────

function SetupCard({ onActivated, accent }: { onActivated: (a: PhoneAgent) => void; accent: string }) {
  const [step, setStep] = useState<'intro' | 'configure'>('intro')
  const [greeting, setGreeting] = useState("Thank you for calling! I'm your virtual order assistant. How can I help you today?")
  const [instructions, setInstructions] = useState('')
  const [areaCode, setAreaCode] = useState('888')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function activate() {
    setLoading(true)
    setError('')
    try {
      const agent = await api.phone.activate({
        greeting,
        special_instructions: instructions,
        area_code: areaCode,
      })
      onActivated(agent)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Activation failed')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:border-transparent'

  if (step === 'intro') {
    return (
      <div className="max-w-2xl">
        <div className="bg-white rounded-2xl border border-gray-200 p-8">
          <div className="flex items-start gap-5 mb-6">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0" style={{ backgroundColor: `${accent}18` }}>
              📞
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">AI Phone Order Agent</h2>
              <p className="text-sm text-gray-500 mt-1">
                A 24/7 AI voice agent answers your phone, takes orders from your live menu, and
                sends them straight to your dashboard — even when you're busy or closed.
              </p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 mb-8">
            {[
              { icon: '🎙️', title: 'Natural voice ordering', desc: 'Conversational AI guides callers through your full menu' },
              { icon: '📋', title: 'Live menu sync', desc: 'Always reflects your current menu with real prices' },
              { icon: '🔔', title: 'Instant dashboard orders', desc: 'Orders appear in your Orders tab within seconds' },
              { icon: '🕐', title: 'After-hours coverage', desc: 'Takes orders around the clock, 365 days a year' },
            ].map(f => (
              <div key={f.title} className="flex gap-3 p-4 bg-gray-50 rounded-xl">
                <span className="text-xl shrink-0">{f.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{f.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => setStep('configure')}
            className="text-white px-6 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ backgroundColor: accent }}
          >
            Set Up Phone Agent →
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-xl">
      <button onClick={() => setStep('intro')} className="text-sm text-gray-400 hover:text-gray-600 mb-4">← Back</button>
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
        <h2 className="text-base font-bold text-gray-900">Configure Your Agent</h2>

        <div>
          <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
            Greeting <span className="font-normal text-gray-400 normal-case">(what callers hear first)</span>
          </label>
          <textarea
            value={greeting}
            onChange={e => setGreeting(e.target.value)}
            rows={3}
            className={`${inputCls} resize-none`}
            style={{ '--tw-ring-color': accent } as React.CSSProperties}
            placeholder="Thank you for calling! How can I help you today?"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
            Special Instructions <span className="font-normal text-gray-400 normal-case">(optional)</span>
          </label>
          <textarea
            value={instructions}
            onChange={e => setInstructions(e.target.value)}
            rows={3}
            className={`${inputCls} resize-none`}
            placeholder="e.g. We close at 10pm. No substitutions on combo meals. Delivery requires $30 minimum."
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
            Preferred Area Code
          </label>
          <input
            type="text"
            value={areaCode}
            onChange={e => setAreaCode(e.target.value.replace(/\D/g, '').slice(0, 3))}
            maxLength={3}
            className={`w-32 ${inputCls} font-mono`}
            placeholder="888"
          />
          <p className="text-xs text-gray-400 mt-1">We'll provision a local number for you. Customers call this number (or forward your existing line to it).</p>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <button
          onClick={activate}
          disabled={loading}
          className="w-full text-white py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: accent }}
        >
          {loading ? 'Activating…' : 'Activate Phone Agent'}
        </button>

        <p className="text-xs text-gray-400 text-center">
          Requires <span className="font-mono bg-gray-100 px-1 rounded">VAPI_API_KEY</span> set in your Railway environment.
        </p>
      </div>
    </div>
  )
}

// ── Active agent view ─────────────────────────────────────────────────────────

function AgentActive({
  agent, calls, accent, onRefresh,
}: {
  agent: PhoneAgent; calls: PhoneCall[]; accent: string; onRefresh: () => void
}) {
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [deactivating, setDeactivating] = useState(false)
  const [editGreeting, setEditGreeting] = useState(agent.greeting)
  const [editInstructions, setEditInstructions] = useState(agent.special_instructions)
  const [savingConfig, setSavingConfig] = useState(false)
  const [configMsg, setConfigMsg] = useState('')
  const [expandedCall, setExpandedCall] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  async function syncMenu() {
    setSyncing(true)
    setSyncMsg('')
    try {
      const r = await api.phone.syncMenu()
      setSyncMsg(`✓ Synced ${r.menu_items_synced} menu items`)
    } catch (e: unknown) {
      setSyncMsg(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncMsg(''), 4000)
    }
  }

  async function saveConfig() {
    setSavingConfig(true)
    try {
      await api.phone.updateConfig({ greeting: editGreeting, special_instructions: editInstructions })
      setConfigMsg('✓ Saved')
    } catch (e: unknown) {
      setConfigMsg(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSavingConfig(false)
      setTimeout(() => setConfigMsg(''), 3000)
    }
  }

  async function deactivate() {
    if (!confirm('Deactivate the phone agent? Calls will no longer be answered.')) return
    setDeactivating(true)
    try {
      await api.phone.deactivate()
      onRefresh()
    } catch { setDeactivating(false) }
  }

  function copyNumber() {
    if (!agent.phone_number) return
    navigator.clipboard.writeText(agent.phone_number)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:border-transparent'
  const todayCalls = calls.filter(c => new Date(c.created_at).toDateString() === new Date().toDateString()).length

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Status header */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ backgroundColor: `${accent}18` }}>
              📞
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full" />
                <span className="text-sm font-semibold text-green-600">Live</span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">AI Phone Agent is active and answering calls</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={syncMenu}
              disabled={syncing}
              className="text-xs border border-gray-200 hover:bg-gray-50 text-gray-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {syncing ? 'Syncing…' : '↻ Sync Menu'}
            </button>
            <button
              onClick={deactivate}
              disabled={deactivating}
              className="text-xs border border-red-200 hover:bg-red-50 text-red-500 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              Deactivate
            </button>
          </div>
        </div>
        {syncMsg && <p className={`mt-3 text-xs ${syncMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>{syncMsg}</p>}

        {/* Phone number + forwarding instructions */}
        <div className="mt-5 pt-5 border-t border-gray-100">
          {agent.phone_number ? (
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">Your Order Line</p>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold text-gray-900 font-mono tracking-wide">{agent.phone_number}</span>
                <button
                  onClick={copyNumber}
                  className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-2.5 py-1 rounded-lg transition-colors"
                >
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <p className="text-xs font-semibold text-amber-700 mb-1">How to connect your business number</p>
                <p className="text-xs text-amber-600">
                  Set up call forwarding from your existing business phone to <strong>{agent.phone_number}</strong>.
                  All forwarded calls will be answered by the AI agent, and orders will appear in your dashboard instantly.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-gray-700">Phone number not yet provisioned</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Add your <span className="font-mono bg-white px-1 rounded border border-gray-200">VAPI_API_KEY</span> in
                Railway and re-activate to get a dedicated number.
              </p>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="mt-5 grid grid-cols-3 gap-4 pt-4 border-t border-gray-100">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Total Calls</p>
            <p className="text-xl font-bold text-gray-900 mt-0.5">{agent.total_calls}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Today</p>
            <p className="text-xl font-bold text-gray-900 mt-0.5">{todayCalls}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Last Call</p>
            <p className="text-sm font-semibold text-gray-900 mt-0.5">
              {agent.last_call_at ? timeAgo(agent.last_call_at) : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Config */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">Agent Configuration</h3>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Greeting</label>
          <textarea
            value={editGreeting}
            onChange={e => setEditGreeting(e.target.value)}
            rows={2}
            className={`${inputCls} resize-none`}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Special Instructions</label>
          <textarea
            value={editInstructions}
            onChange={e => setEditInstructions(e.target.value)}
            rows={3}
            className={`${inputCls} resize-none`}
            placeholder="Hours, policies, delivery minimums, etc."
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={saveConfig}
            disabled={savingConfig}
            className="text-sm text-white px-4 py-2 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: accent }}
          >
            {savingConfig ? 'Saving…' : 'Save & Push to Agent'}
          </button>
          {configMsg && <span className={`text-sm ${configMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>{configMsg}</span>}
        </div>
      </div>

      {/* Call log */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Recent Calls</h3>
        {calls.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No calls yet — your agent is ready and waiting.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {calls.map(call => {
              const parsed = parseStructured(call.structured_data)
              const isOpen = expandedCall === call.id
              return (
                <div key={call.id} className="py-3">
                  <div
                    className="flex items-center gap-4 cursor-pointer"
                    onClick={() => setExpandedCall(isOpen ? null : call.id)}
                  >
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm shrink-0">
                      {call.order_created ? '✓' : '📞'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 truncate">{parsed.name}</span>
                        {call.order_created && (
                          <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">Order placed</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{parsed.items}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-gray-400">{timeAgo(call.created_at)}</p>
                      <p className="text-xs text-gray-300">{fmt(call.duration_secs)}</p>
                    </div>
                    <span className="text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</span>
                  </div>
                  {isOpen && (
                    <div className="mt-3 ml-12 space-y-2">
                      {call.summary && (
                        <div className="bg-gray-50 rounded-lg px-3 py-2">
                          <p className="text-xs font-medium text-gray-600 mb-0.5">Summary</p>
                          <p className="text-xs text-gray-700">{call.summary}</p>
                        </div>
                      )}
                      {call.transcript && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-gray-400 hover:text-gray-600">Show full transcript</summary>
                          <pre className="mt-2 bg-gray-50 rounded-lg px-3 py-2 whitespace-pre-wrap text-gray-600 text-xs max-h-60 overflow-y-auto">
                            {call.transcript}
                          </pre>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PhonePage() {
  useParams<{ slug: string }>()
  const customization = useCustomization()
  const accent = customization.accent_color || '#16a34a'

  const [status, setStatus] = useState<PhoneStatus | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const s = await api.phone.status()
      setStatus(s)
    } catch { /* handled by layout */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="text-sm text-gray-400 py-20 text-center">Loading…</div>
  if (!status) return null

  if (!status.configured) {
    return (
      <div className="max-w-xl">
        <h1 className="text-xl font-bold text-gray-900 mb-6">AI Phone Agent</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <p className="text-sm font-semibold text-amber-800">VAPI API key required</p>
          <p className="text-sm text-amber-700 mt-1">
            Add <span className="font-mono bg-white px-1 rounded">VAPI_API_KEY</span> to your Railway environment variables to enable the AI phone agent.
          </p>
          <p className="text-xs text-amber-600 mt-2">Get your key at <strong>vapi.ai</strong> → Dashboard → API Keys.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">AI Phone Agent</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {status.agent?.is_active
              ? 'Your AI agent is live and taking orders'
              : 'Activate to start taking phone orders automatically'}
          </p>
        </div>
      </div>

      {status.agent?.is_active ? (
        <AgentActive
          agent={status.agent}
          calls={status.recent_calls}
          accent={accent}
          onRefresh={load}
        />
      ) : (
        <SetupCard
          accent={accent}
          onActivated={() => load()}
        />
      )}
    </div>
  )
}
