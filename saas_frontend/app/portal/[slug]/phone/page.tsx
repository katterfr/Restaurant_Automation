'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { api, PhoneStatus, PhoneAgent, PhoneCall, SmsSession, SmsMessage } from '@/lib/api'
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
  } catch { return { items: '—', name: '—', type: 'pickup' } }
}

function maskPhone(p: string | null): string {
  if (!p) return '—'
  return p.length > 6 ? `${p.slice(0, -4).replace(/\d/g, '•')}${p.slice(-4)}` : p
}

// ── SMS Conversation drawer ───────────────────────────────────────────────────

function SmsConversation({ session, onClose }: { session: SmsSession; onClose: () => void }) {
  const [messages, setMessages] = useState<SmsMessage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.phone.smsMessages(session.id)
      .then(d => setMessages(d.messages))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [session.id])

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white w-full max-w-sm h-full shadow-2xl flex flex-col">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">{maskPhone(session.customer_phone)}</p>
            <p className="text-xs text-gray-400">
              {session.status === 'ordered' ? '✓ Order placed' : 'Active'} · {timeAgo(session.last_message_at)}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {loading ? (
            <p className="text-sm text-gray-400 text-center pt-8">Loading…</p>
          ) : messages.map(msg => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  msg.role === 'user'
                    ? 'bg-gray-100 text-gray-900 rounded-tl-sm'
                    : 'bg-green-600 text-white rounded-tr-sm'
                }`}
              >
                {msg.content}
                <p className={`text-xs mt-1 ${msg.role === 'user' ? 'text-gray-400' : 'text-green-200'}`}>
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Setup card ────────────────────────────────────────────────────────────────

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
      const agent = await api.phone.activate({ greeting, special_instructions: instructions, area_code: areaCode })
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
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0" style={{ backgroundColor: `${accent}18` }}>📞</div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">AI Voice + Text Agent</h2>
              <p className="text-sm text-gray-500 mt-1">
                A 24/7 AI agent handles both phone calls and text messages — customers can switch between voice and text seamlessly, and every order lands in your dashboard.
              </p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 mb-8">
            {[
              { icon: '📞', title: 'Voice ordering', desc: 'AI answers calls, takes orders by voice' },
              { icon: '💬', title: 'Text ordering', desc: 'Customers can text to order — AI responds instantly' },
              { icon: '🔄', title: 'Voice ↔ Text handoff', desc: 'Switch mid-interaction without losing context' },
              { icon: '🔔', title: 'Instant dashboard orders', desc: 'Every order — voice or text — appears in real time' },
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
            Set Up Agent →
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
          <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">Greeting</label>
          <textarea value={greeting} onChange={e => setGreeting(e.target.value)} rows={3} className={`${inputCls} resize-none`} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">Special Instructions <span className="font-normal text-gray-400 normal-case">(optional)</span></label>
          <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={3} className={`${inputCls} resize-none`} placeholder="Hours, delivery minimums, allergy notices, upsell hints…" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">Preferred Area Code</label>
          <input type="text" value={areaCode} onChange={e => setAreaCode(e.target.value.replace(/\D/g,'').slice(0,3))} maxLength={3} className={`w-24 ${inputCls} font-mono`} placeholder="888" />
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        <button onClick={activate} disabled={loading} className="w-full text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50 transition-opacity hover:opacity-90" style={{ backgroundColor: accent }}>
          {loading ? 'Activating…' : 'Activate Agent'}
        </button>
        <p className="text-xs text-gray-400 text-center">Requires <span className="font-mono bg-gray-100 px-1 rounded">VAPI_API_KEY</span> in Railway. Add <span className="font-mono bg-gray-100 px-1 rounded">TWILIO_*</span> + <span className="font-mono bg-gray-100 px-1 rounded">ANTHROPIC_API_KEY</span> to enable SMS.</p>
      </div>
    </div>
  )
}

// ── Active agent ──────────────────────────────────────────────────────────────

function AgentActive({ agent, calls, smsSessions, accent, onRefresh }: {
  agent: PhoneAgent; calls: PhoneCall[]; smsSessions: SmsSession[]; accent: string; onRefresh: () => void
}) {
  const [activeTab, setActiveTab] = useState<'voice' | 'sms'>('voice')
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [deactivating, setDeactivating] = useState(false)
  const [editGreeting, setEditGreeting] = useState(agent.greeting)
  const [editInstructions, setEditInstructions] = useState(agent.special_instructions)
  const [savingConfig, setSavingConfig] = useState(false)
  const [configMsg, setConfigMsg] = useState('')
  const [expandedCall, setExpandedCall] = useState<number | null>(null)
  const [selectedSession, setSelectedSession] = useState<SmsSession | null>(null)
  const [copied, setCopied] = useState(false)

  async function syncMenu() {
    setSyncing(true); setSyncMsg('')
    try { const r = await api.phone.syncMenu(); setSyncMsg(`✓ Synced ${r.menu_items_synced} items`) }
    catch (e: unknown) { setSyncMsg(e instanceof Error ? e.message : 'Sync failed') }
    finally { setSyncing(false); setTimeout(() => setSyncMsg(''), 4000) }
  }

  async function saveConfig() {
    setSavingConfig(true)
    try { await api.phone.updateConfig({ greeting: editGreeting, special_instructions: editInstructions }); setConfigMsg('✓ Saved') }
    catch (e: unknown) { setConfigMsg(e instanceof Error ? e.message : 'Save failed') }
    finally { setSavingConfig(false); setTimeout(() => setConfigMsg(''), 3000) }
  }

  async function deactivate() {
    if (!confirm('Deactivate the agent?')) return
    setDeactivating(true)
    try { await api.phone.deactivate(); onRefresh() }
    catch { setDeactivating(false) }
  }

  function copyNumber() {
    if (!agent.phone_number) return
    navigator.clipboard.writeText(agent.phone_number)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:border-transparent'
  const todayCalls = calls.filter(c => new Date(c.created_at).toDateString() === new Date().toDateString()).length
  const activeSms = smsSessions.filter(s => s.status === 'active').length

  return (
    <div className="space-y-6 max-w-3xl">
      {selectedSession && (
        <SmsConversation session={selectedSession} onClose={() => setSelectedSession(null)} />
      )}

      {/* Status banner */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ backgroundColor: `${accent}18` }}>📞</div>
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full" />
                <span className="text-sm font-semibold text-green-600">Voice + Text Active</span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">AI agent is answering calls and texts 24/7</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={syncMenu} disabled={syncing} className="text-xs border border-gray-200 hover:bg-gray-50 text-gray-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
              {syncing ? 'Syncing…' : '↻ Sync Menu'}
            </button>
            <button onClick={deactivate} disabled={deactivating} className="text-xs border border-red-200 hover:bg-red-50 text-red-500 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
              Deactivate
            </button>
          </div>
        </div>
        {syncMsg && <p className={`mt-2 text-xs ${syncMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>{syncMsg}</p>}

        {/* Phone number */}
        <div className="mt-5 pt-5 border-t border-gray-100">
          {agent.phone_number ? (
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">Your Order Line (Voice + SMS)</p>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold text-gray-900 font-mono tracking-wide">{agent.phone_number}</span>
                <button onClick={copyNumber} className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-2.5 py-1 rounded-lg">
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <div className="mt-3 grid sm:grid-cols-2 gap-3">
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                  <p className="text-xs font-semibold text-blue-700 mb-1">📞 For voice calls</p>
                  <p className="text-xs text-blue-600">Forward your business phone to <strong>{agent.phone_number}</strong>. The AI answers and takes the order.</p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                  <p className="text-xs font-semibold text-green-700 mb-1">💬 For text orders</p>
                  <p className="text-xs text-green-600">Customers can text <strong>{agent.phone_number}</strong> directly. The AI responds and takes their order.</p>
                </div>
              </div>
              <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <p className="text-xs font-semibold text-amber-700 mb-1">🔄 Seamless handoff</p>
                <p className="text-xs text-amber-600">
                  During a voice call, customers can say <em>"I'd rather text"</em> — the AI sends them an SMS and they continue by text.
                  During an SMS session, customers can text <em>"CALL ME"</em> — the AI calls them back and continues by voice.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-gray-700">Phone number not yet provisioned</p>
              <p className="text-xs text-gray-500 mt-0.5">Add your <span className="font-mono bg-white px-1 rounded border border-gray-200">VAPI_API_KEY</span> and re-activate to get a dedicated number.</p>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="mt-5 grid grid-cols-4 gap-3 pt-4 border-t border-gray-100">
          {[
            { label: 'Total Calls', val: agent.total_calls },
            { label: 'Calls Today', val: todayCalls },
            { label: 'SMS Sessions', val: smsSessions.length },
            { label: 'Active Texts', val: activeSms },
          ].map(s => (
            <div key={s.label}>
              <p className="text-xs text-gray-400 uppercase tracking-wide">{s.label}</p>
              <p className="text-xl font-bold text-gray-900 mt-0.5">{s.val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs: Voice calls | SMS conversations */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-100">
          {(['voice', 'sms'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === tab ? 'border-b-2 text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
              style={activeTab === tab ? { borderBottomColor: accent, color: accent } : {}}
            >
              {tab === 'voice' ? `📞 Voice Calls (${calls.length})` : `💬 Text Sessions (${smsSessions.length})`}
            </button>
          ))}
        </div>

        <div className="p-5">
          {activeTab === 'voice' && (
            calls.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No calls yet — your agent is live and waiting.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {calls.map(call => {
                  const parsed = parseStructured(call.structured_data)
                  const isOpen = expandedCall === call.id
                  return (
                    <div key={call.id} className="py-3">
                      <div className="flex items-center gap-4 cursor-pointer" onClick={() => setExpandedCall(isOpen ? null : call.id)}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 ${call.order_created ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {call.order_created ? '✓' : '📞'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900">{parsed.name}</span>
                            {call.order_created && <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Order placed</span>}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5 truncate">{parsed.items}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-gray-400">{timeAgo(call.created_at)}</p>
                          <p className="text-xs text-gray-300">{fmt(call.duration_secs)}</p>
                        </div>
                        <span className="text-gray-300 text-xs">{isOpen ? '▲' : '▼'}</span>
                      </div>
                      {isOpen && call.summary && (
                        <div className="mt-2 ml-12 bg-gray-50 rounded-lg px-3 py-2">
                          <p className="text-xs text-gray-600">{call.summary}</p>
                          {call.transcript && (
                            <details className="mt-2 text-xs">
                              <summary className="cursor-pointer text-gray-400 hover:text-gray-600">Show transcript</summary>
                              <pre className="mt-1 whitespace-pre-wrap text-gray-500 text-xs max-h-48 overflow-y-auto">{call.transcript}</pre>
                            </details>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          )}

          {activeTab === 'sms' && (
            smsSessions.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-gray-400">No text conversations yet.</p>
                <p className="text-xs text-gray-400 mt-1">Customers can text <strong>{agent.phone_number || 'your number'}</strong> to start ordering.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {smsSessions.map(session => (
                  <div
                    key={session.id}
                    className="py-3 flex items-center gap-4 cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors"
                    onClick={() => setSelectedSession(session)}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 ${
                      session.status === 'ordered' ? 'bg-green-100 text-green-700' :
                      session.status === 'active'  ? 'bg-blue-100 text-blue-600' :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      {session.status === 'ordered' ? '✓' : '💬'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 font-mono">{maskPhone(session.customer_phone)}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full capitalize font-medium ${
                          session.status === 'ordered' ? 'bg-green-100 text-green-700' :
                          session.status === 'active' ? 'bg-blue-100 text-blue-600' :
                          'bg-gray-100 text-gray-500'
                        }`}>{session.status}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{session.message_count} messages</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-gray-400">{timeAgo(session.last_message_at)}</p>
                      <p className="text-xs text-blue-500 mt-0.5">View →</p>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {/* Config */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">Agent Configuration</h3>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Greeting (voice)</label>
          <textarea value={editGreeting} onChange={e => setEditGreeting(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Special Instructions</label>
          <textarea value={editInstructions} onChange={e => setEditInstructions(e.target.value)} rows={3} className={`${inputCls} resize-none`} placeholder="Hours, delivery minimums, allergy info, upsell hints…" />
        </div>
        <div className="flex items-center gap-3">
          <button onClick={saveConfig} disabled={savingConfig} className="text-sm text-white px-4 py-2 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: accent }}>
            {savingConfig ? 'Saving…' : 'Save & Push to Agent'}
          </button>
          {configMsg && <span className={`text-sm ${configMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>{configMsg}</span>}
        </div>
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
  const [smsSessions, setSmsSessions] = useState<SmsSession[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [s, sms] = await Promise.all([
        api.phone.status(),
        api.phone.smsSessions().catch(() => [] as SmsSession[]),
      ])
      setStatus(s)
      setSmsSessions(sms)
    } catch { /* handled by layout */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="text-sm text-gray-400 py-20 text-center">Loading…</div>
  if (!status) return null

  if (!status.configured) {
    return (
      <div className="max-w-xl">
        <h1 className="text-xl font-bold text-gray-900 mb-6">AI Voice + Text Agent</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <p className="text-sm font-semibold text-amber-800">VAPI API key required</p>
          <p className="text-sm text-amber-700 mt-1">Add <span className="font-mono bg-white px-1 rounded">VAPI_API_KEY</span> to Railway environment variables to enable the agent.</p>
          <div className="mt-3 space-y-1 text-xs text-amber-600">
            <p>• <span className="font-mono">VAPI_API_KEY</span> — Required for voice calls (vapi.ai)</p>
            <p>• <span className="font-mono">TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_SMS_NUMBER</span> — Required for SMS ordering</p>
            <p>• <span className="font-mono">ANTHROPIC_API_KEY</span> — Required for SMS AI conversation</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">AI Voice + Text Agent</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {status.agent?.is_active
            ? 'Your AI agent is live — answering calls and texts around the clock'
            : 'Activate to start taking orders by voice and text automatically'}
        </p>
      </div>

      {status.agent?.is_active ? (
        <AgentActive
          agent={status.agent}
          calls={status.recent_calls}
          smsSessions={smsSessions}
          accent={accent}
          onRefresh={load}
        />
      ) : (
        <SetupCard accent={accent} onActivated={() => load()} />
      )}
    </div>
  )
}
