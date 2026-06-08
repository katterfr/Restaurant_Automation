'use client'
import { useEffect, useState, useCallback } from 'react'
import { api, DeliveryProvider } from '@/lib/api'

const PROVIDER_ICONS: Record<string, string> = {
  doordash:   '🔴',
  ubereats:   '⚫',
  grubhub:    '🟠',
  instacart:  '🟢',
}

function ConnectForm({ provider, name, onConnected }: { provider: string; name: string; onConnected: () => void }) {
  const [open, setOpen] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [storeId, setStoreId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!apiKey.trim()) { setError('API key is required'); return }
    setSaving(true); setError('')
    try {
      await api.delivery.connect(provider, { api_key: apiKey, store_id: storeId || undefined })
      setOpen(false); onConnected()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Connection failed') }
    finally { setSaving(false) }
  }

  if (!open) return (
    <button onClick={() => setOpen(true)} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
      Connect
    </button>
  )

  return (
    <form onSubmit={submit} className="mt-4 space-y-3 bg-gray-50 rounded-xl p-4 border border-gray-200">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Connect {name}</p>
      <div>
        <label className="block text-xs text-gray-500 mb-1">API Key / Merchant Token</label>
        <input required type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} className={inputCls} placeholder="Paste your API key…" autoComplete="off" />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Store ID <span className="text-gray-400">(optional)</span></label>
        <input value={storeId} onChange={e => setStoreId(e.target.value)} className={inputCls} placeholder="Your store/location ID" />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium">
          {saving ? 'Connecting…' : 'Save & Connect'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="bg-white border border-gray-200 text-gray-500 px-3 py-2 rounded-lg text-sm">
          Cancel
        </button>
      </div>
      <p className="text-xs text-gray-400">You can find your API key in your merchant portal on the {name} website.</p>
    </form>
  )
}

export default function DeliveryPage() {
  const [providers, setProviders] = useState<Record<string, DeliveryProvider>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [disconnecting, setDisconnecting] = useState<string | null>(null)

  const load = useCallback(async () => {
    try { setProviders(await api.delivery.connections()) }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function disconnect(provider: string) {
    if (!confirm('Disconnect this delivery service?')) return
    setDisconnecting(provider)
    try { await api.delivery.disconnect(provider); await load() }
    catch { /* ignore */ }
    finally { setDisconnecting(null) }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Delivery Integrations</h1>
        <p className="text-sm text-gray-400 mt-0.5">Connect your restaurant to delivery platforms so orders flow in automatically.</p>
      </div>

      {loading && <div className="text-sm text-gray-400 py-12 text-center">Loading…</div>}
      {error   && <div className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl p-4">{error}</div>}

      {!loading && !error && (
        <div className="space-y-4">
          {Object.entries(providers).map(([key, p]) => (
            <div key={key} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{PROVIDER_ICONS[key] ?? '📦'}</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                    {p.connected ? (
                      <p className="text-xs text-green-600">
                        Connected {p.store_id ? `· Store ${p.store_id}` : ''}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400">Not connected</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {p.connected && (
                    <span className="text-xs bg-green-100 text-green-700 px-2.5 py-0.5 rounded-full font-medium">Active</span>
                  )}
                  {p.connected ? (
                    <button
                      onClick={() => disconnect(key)}
                      disabled={disconnecting === key}
                      className="text-sm text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-200 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {disconnecting === key ? 'Disconnecting…' : 'Disconnect'}
                    </button>
                  ) : (
                    <ConnectForm provider={key} name={p.name} onConnected={load} />
                  )}
                </div>
              </div>
              {!p.connected && p.apply_url && (
                <p className="text-xs text-gray-400 mt-3">
                  Don&apos;t have a merchant account?{' '}
                  <a href={p.apply_url} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline">
                    Apply to become a {p.name} partner →
                  </a>
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
