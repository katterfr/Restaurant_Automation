'use client'
import { useState, useEffect, useCallback } from 'react'
import { api, AdminPhoneAgent, PhoneCall } from '@/lib/api'

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtDuration(secs: number) {
  if (secs < 60) return `${secs}s`
  return `${Math.floor(secs / 60)}m ${secs % 60}s`
}

export default function AdminPhoneAgentsPage() {
  const [agents,   setAgents]   = useState<AdminPhoneAgent[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [selected, setSelected] = useState<AdminPhoneAgent | null>(null)
  const [calls,    setCalls]    = useState<PhoneCall[]>([])
  const [callsLoad,setCallsLoad]= useState(false)
  const [saving,   setSaving]   = useState<number | null>(null)
  const [editing,  setEditing]  = useState<number | null>(null)
  const [editGreeting, setEditGreeting] = useState('')
  const [editInstructions, setEditInstructions] = useState('')

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const data = await api.adminPhoneAgents.list()
      setAgents(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function selectAgent(a: AdminPhoneAgent) {
    setSelected(a)
    setEditing(null)
    setCallsLoad(true)
    try {
      const data = await api.adminPhoneAgents.calls(a.tenant_id)
      setCalls(data)
    } catch { setCalls([]) }
    finally  { setCallsLoad(false) }
  }

  async function toggleActive(a: AdminPhoneAgent) {
    setSaving(a.tenant_id)
    try {
      const updated = await api.adminPhoneAgents.update(a.tenant_id, { is_active: !a.is_active })
      setAgents(prev => prev.map(ag => ag.tenant_id === a.tenant_id ? { ...ag, ...updated } : ag))
      if (selected?.tenant_id === a.tenant_id) setSelected(prev => prev ? { ...prev, ...updated } : prev)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(null)
    }
  }

  function startEdit(a: AdminPhoneAgent) {
    setEditing(a.tenant_id)
    setEditGreeting(a.greeting || '')
    setEditInstructions(a.special_instructions || '')
  }

  async function saveEdit(a: AdminPhoneAgent) {
    setSaving(a.tenant_id)
    try {
      const updated = await api.adminPhoneAgents.update(a.tenant_id, {
        greeting: editGreeting,
        special_instructions: editInstructions,
      })
      setAgents(prev => prev.map(ag => ag.tenant_id === a.tenant_id ? { ...ag, ...updated } : ag))
      if (selected?.tenant_id === a.tenant_id) setSelected(prev => prev ? { ...prev, ...updated } : prev)
      setEditing(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(null)
    }
  }

  const activeCount   = agents.filter(a => a.is_active).length
  const inactiveCount = agents.filter(a => !a.is_active && a.agent_id).length
  const noneCount     = agents.filter(a => !a.agent_id).length

  return (
    <div className="flex h-full min-h-screen bg-gray-950 text-white">
      {/* Left panel — agent list */}
      <div className="w-80 shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-5 border-b border-gray-800">
          <h1 className="text-base font-bold text-white">Phone Agents</h1>
          <p className="text-xs text-gray-400 mt-0.5">Manage AI phone agents for all restaurants</p>
        </div>

        {/* Stats */}
        <div className="px-4 py-3 bg-gray-800/50 border-b border-gray-800 flex gap-4 text-xs">
          <span className="text-emerald-400 font-medium">{activeCount} active</span>
          <span className="text-yellow-400">{inactiveCount} inactive</span>
          <span className="text-gray-500">{noneCount} not set up</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-sm text-gray-500">Loading...</div>
          ) : agents.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">No tenants with phone agent feature enabled.</div>
          ) : (
            agents.map(a => (
              <button
                key={a.tenant_id}
                onClick={() => selectAgent(a)}
                className={`w-full text-left px-4 py-3 border-b border-gray-800 transition-colors ${
                  selected?.tenant_id === a.tenant_id ? 'bg-blue-600/20 border-l-2 border-l-blue-500' : 'hover:bg-gray-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white truncate">{a.tenant_name}</span>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                    !a.agent_id      ? 'bg-gray-700 text-gray-400' :
                    a.is_active      ? 'bg-emerald-500/20 text-emerald-400' :
                                       'bg-yellow-500/20 text-yellow-400'
                  }`}>
                    {!a.agent_id ? 'Not set up' : a.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex gap-3 mt-1 text-[11px] text-gray-400">
                  <span>{a.phone_number || 'No number'}</span>
                  {a.total_calls ? <span>{a.total_calls} calls</span> : null}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right — detail panel */}
      <div className="flex-1 overflow-y-auto">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 p-8">
            <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-2xl">☎</div>
            <p className="text-gray-300 font-medium">Select a restaurant</p>
            <p className="text-gray-500 text-sm max-w-xs">Click any restaurant to manage their AI phone agent, update greetings, and view call history.</p>
          </div>
        ) : (
          <div className="p-6 space-y-6 max-w-2xl">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white">{selected.tenant_name}</h2>
                <p className="text-gray-400 text-sm">{selected.slug} · {selected.plan}</p>
              </div>
              {/* Activate / Deactivate toggle */}
              <div className="flex items-center gap-3">
                <span className={`text-sm font-medium ${selected.is_active ? 'text-emerald-400' : 'text-gray-400'}`}>
                  {selected.agent_id ? (selected.is_active ? 'Active' : 'Inactive') : 'Not configured'}
                </span>
                {selected.agent_id && (
                  <button
                    onClick={() => toggleActive(selected)}
                    disabled={saving === selected.tenant_id}
                    className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${selected.is_active ? 'bg-emerald-600' : 'bg-gray-600'}`}
                  >
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${selected.is_active ? 'left-6' : 'left-1'}`} />
                  </button>
                )}
                {!selected.agent_id && (
                  <button
                    onClick={() => toggleActive(selected)}
                    disabled={saving === selected.tenant_id}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg font-medium transition-colors disabled:opacity-40"
                  >
                    Activate
                  </button>
                )}
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm">
                {error} <button onClick={() => setError(null)} className="ml-2">✕</button>
              </div>
            )}

            {/* Stats */}
            {selected.agent_id && (
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Phone Number',  value: selected.phone_number || 'Not assigned' },
                  { label: 'Total Calls',   value: String(selected.total_calls ?? 0) },
                  { label: 'Last Call',     value: fmtDate(selected.last_call_at) },
                ].map(stat => (
                  <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <p className="text-xs text-gray-400 mb-1">{stat.label}</p>
                    <p className="text-sm font-semibold text-white">{stat.value}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Greeting & instructions */}
            {selected.agent_id && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">Agent Configuration</h3>
                  {editing !== selected.tenant_id ? (
                    <button onClick={() => startEdit(selected)} className="text-xs text-blue-400 hover:text-blue-300 px-3 py-1.5 bg-blue-600/10 rounded-lg border border-blue-500/20 hover:border-blue-500/40 transition-all">
                      Edit
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={() => setEditing(null)} className="text-xs text-gray-400 px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors">Cancel</button>
                      <button onClick={() => saveEdit(selected)} disabled={saving === selected.tenant_id} className="text-xs text-white bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded-lg disabled:opacity-40 transition-colors">
                        {saving === selected.tenant_id ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-400 font-medium">Greeting</label>
                    {editing === selected.tenant_id ? (
                      <textarea value={editGreeting} onChange={e => setEditGreeting(e.target.value)} rows={3} className="mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none" />
                    ) : (
                      <p className="mt-1 text-sm text-gray-300 bg-gray-800/50 rounded-lg px-3 py-2 border border-gray-700/50">
                        {selected.greeting || 'No greeting set'}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 font-medium">Special Instructions</label>
                    {editing === selected.tenant_id ? (
                      <textarea value={editInstructions} onChange={e => setEditInstructions(e.target.value)} rows={3} placeholder="e.g. Always mention today's specials..." className="mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none" />
                    ) : (
                      <p className="mt-1 text-sm text-gray-300 bg-gray-800/50 rounded-lg px-3 py-2 border border-gray-700/50">
                        {selected.special_instructions || 'None'}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Call history */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-800">
                <h3 className="text-sm font-semibold text-white">Recent Calls</h3>
              </div>
              {callsLoad ? (
                <div className="p-4 text-sm text-gray-500">Loading calls...</div>
              ) : calls.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-500">No calls recorded yet.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-800/60">
                    <tr>
                      {['Caller', 'Duration', 'Order', 'Summary', 'Time'].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs text-gray-400 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {calls.map(call => (
                      <tr key={call.id} className="hover:bg-gray-800/30">
                        <td className="px-4 py-2.5 text-gray-300 text-xs font-mono">{call.caller_number || '—'}</td>
                        <td className="px-4 py-2.5 text-gray-300 text-xs">{fmtDuration(call.duration_secs)}</td>
                        <td className="px-4 py-2.5">
                          {call.order_created
                            ? <span className="text-emerald-400 text-xs">#{call.order_id}</span>
                            : <span className="text-gray-600 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-gray-400 text-xs max-w-xs truncate">{call.summary || '—'}</td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{fmtDate(call.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
