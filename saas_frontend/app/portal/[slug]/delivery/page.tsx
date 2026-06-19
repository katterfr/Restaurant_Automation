'use client'
import { useEffect, useState, useCallback } from 'react'
import { api, DeliveryProvider } from '@/lib/api'

const PROVIDER_META: Record<string, {
  icon: string
  color: string
  fields: { key: string; label: string; placeholder: string; secret?: boolean; required?: boolean }[]
  instructions: string
  applyUrl: string
}> = {
  doordash: {
    icon: '/icons/doordash.svg',
    color: '#FF3008',
    fields: [
      { key: 'developer_id', label: 'Developer ID',    placeholder: 'e.g. a1b2c3d4-…',  required: true },
      { key: 'key_id',       label: 'Key ID',          placeholder: 'e.g. key_…',        required: true },
      { key: 'signing_secret', label: 'Signing Secret', placeholder: 'Base64 secret',    secret: true, required: true },
      { key: 'store_id',     label: 'Store / Location ID', placeholder: 'Your DoorDash store ID' },
    ],
    instructions: 'Find these in the DoorDash Developer Portal under your app credentials.',
    applyUrl: 'https://developer.doordash.com',
  },
  ubereats: {
    icon: '/icons/ubereats.svg',
    color: '#06C167',
    fields: [
      { key: 'client_id',     label: 'Client ID',     placeholder: 'OAuth client ID',    required: true },
      { key: 'client_secret', label: 'Client Secret', placeholder: 'OAuth client secret', secret: true, required: true },
      { key: 'store_id',      label: 'Store UUID',    placeholder: 'Your Uber Eats store UUID', required: true },
    ],
    instructions: 'Find these in the Uber Developer Dashboard under your Eats app → Credentials.',
    applyUrl: 'https://developer.uber.com/docs/eats',
  },
  grubhub: {
    icon: '/icons/grubhub.svg',
    color: '#F63440',
    fields: [
      { key: 'api_key',    label: 'API Key / Token',  placeholder: 'Your Grubhub merchant token', secret: true, required: true },
      { key: 'store_id',   label: 'Restaurant ID',    placeholder: 'Your Grubhub restaurant ID' },
    ],
    instructions: 'Contact your Grubhub restaurant success manager to get your API credentials.',
    applyUrl: 'https://restaurant.grubhub.com',
  },
  instacart: {
    icon: '/icons/instacart.svg',
    color: '#43B02A',
    fields: [
      { key: 'api_key',  label: 'API Key',   placeholder: 'Instacart Connect API key', secret: true, required: true },
      { key: 'store_id', label: 'Store ID',  placeholder: 'Your Instacart store ID' },
    ],
    instructions: 'Get your API key from the Instacart Connect partner portal.',
    applyUrl: 'https://partner.instacart.com',
  },
}

const PROVIDER_NAMES: Record<string, string> = {
  doordash: 'DoorDash',
  ubereats: 'Uber Eats',
  grubhub: 'Grubhub',
  instacart: 'Instacart',
}

function ProviderIcon({ provider }: { provider: string }) {
  const colors: Record<string, string> = {
    doordash: 'bg-red-500', ubereats: 'bg-black', grubhub: 'bg-orange-500', instacart: 'bg-green-500',
  }
  const letters: Record<string, string> = {
    doordash: 'DD', ubereats: 'UE', grubhub: 'GH', instacart: 'IC',
  }
  return (
    <div className={`w-10 h-10 rounded-xl ${colors[provider] ?? 'bg-gray-400'} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
      {letters[provider] ?? '?'}
    </div>
  )
}

function ConnectForm({ provider, onConnected }: { provider: string; onConnected: () => void }) {
  const meta = PROVIDER_META[provider]
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent'

  function set(key: string, val: string) {
    setValues(v => ({ ...v, [key]: val }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const missing = meta.fields.filter(f => f.required && !values[f.key]?.trim())
    if (missing.length) { setError(`Required: ${missing.map(f => f.label).join(', ')}`); return }

    setSaving(true); setError('')
    try {
      // Pack all fields except store_id into api_key as JSON
      const { store_id, ...rest } = values
      const apiKey = Object.keys(rest).length === 1 && rest.api_key
        ? rest.api_key
        : JSON.stringify(rest)
      await api.delivery.connect(provider, { api_key: apiKey, store_id: store_id || undefined })
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
      <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Connect {PROVIDER_NAMES[provider]}</p>
      {meta.fields.map(f => (
        <div key={f.key}>
          <label className="block text-xs text-gray-500 mb-1">
            {f.label} {f.required && <span className="text-red-400">*</span>}
          </label>
          <input
            type={f.secret ? 'password' : 'text'}
            value={values[f.key] ?? ''}
            onChange={e => set(f.key, e.target.value)}
            className={inputCls}
            placeholder={f.placeholder}
            autoComplete="off"
          />
        </div>
      ))}
      {error && <p className="text-xs text-red-500">{error}</p>}
      <p className="text-xs text-gray-400">{meta.instructions}</p>
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium">
          {saving ? 'Connecting…' : 'Save & Connect'}
        </button>
        <button type="button" onClick={() => { setOpen(false); setError('') }} className="bg-white border border-gray-200 text-gray-500 px-3 py-2 rounded-lg text-sm">
          Cancel
        </button>
      </div>
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
                  <ProviderIcon provider={key} />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                    {p.connected ? (
                      <p className="text-xs text-green-600 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full inline-block" />
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
                    <ConnectForm provider={key} onConnected={load} />
                  )}
                </div>
              </div>

              {!p.connected && (
                <p className="text-xs text-gray-400 mt-3">
                  Don&apos;t have a merchant account?{' '}
                  <a href={PROVIDER_META[key]?.applyUrl} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline">
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
