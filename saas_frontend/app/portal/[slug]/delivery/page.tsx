'use client'
import { useEffect, useState, useCallback } from 'react'
import { api, DeliveryProvider } from '@/lib/api'

const PROVIDER_META: Record<string, {
  color: string
  abbr: string
  bgColor: string
  storeIdLabel: string
  storeIdPlaceholder: string
  verifiable: boolean
  steps: { text: string; detail: string }[]
  applyUrl: string
  applyLabel: string
}> = {
  doordash: {
    color: '#FF3008', abbr: 'DD', bgColor: 'bg-red-500',
    storeIdLabel: 'DoorDash Store ID',
    storeIdPlaceholder: 'e.g. 1234567',
    verifiable: true,
    steps: [
      { text: 'Log in to your DoorDash Merchant Portal', detail: 'Go to merchant.doordash.com and sign in with your DoorDash business account.' },
      { text: 'Open Store Settings', detail: 'Click on your restaurant name in the top left, then go to Settings → Store Info.' },
      { text: 'Copy your Store ID', detail: 'Your Store ID is the number shown next to your store name, or in the URL: /store/XXXXXXX/settings' },
      { text: 'Paste it below and click Verify & Connect', detail: 'We\'ll instantly confirm the connection using Careful Server\'s DoorDash platform credentials.' },
    ],
    applyUrl: 'https://merchant.doordash.com',
    applyLabel: 'Apply to become a DoorDash partner',
  },
  ubereats: {
    color: '#06C167', abbr: 'UE', bgColor: 'bg-black',
    storeIdLabel: 'Uber Eats Store UUID',
    storeIdPlaceholder: 'e.g. xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    verifiable: true,
    steps: [
      { text: 'Log in to your Uber Eats Manager', detail: 'Go to merchants.ubereats.com and sign in with your Uber Eats business account.' },
      { text: 'Go to the Restaurant Details page', detail: 'Select your restaurant from the list, then click Settings → Restaurant Info.' },
      { text: 'Copy your Store UUID', detail: 'Your UUID appears in the browser URL: /restaurants/XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX/details' },
      { text: 'Paste it below and click Verify & Connect', detail: 'We\'ll confirm the store exists using Careful Server\'s Uber Eats API access.' },
    ],
    applyUrl: 'https://www.ubereats.com/restaurant/sign-up',
    applyLabel: 'Apply to become an Uber Eats partner',
  },
  grubhub: {
    color: '#F63440', abbr: 'GH', bgColor: 'bg-orange-500',
    storeIdLabel: 'Grubhub Restaurant ID',
    storeIdPlaceholder: 'e.g. 123456',
    verifiable: false,
    steps: [
      { text: 'Log in to Grubhub for Restaurants', detail: 'Go to restaurant.grubhub.com and sign in with your Grubhub account.' },
      { text: 'Find your Restaurant ID', detail: 'Go to Account Settings. Your Restaurant ID appears in the URL: /restaurant/XXXXXX/ or in your profile page.' },
      { text: 'Copy and paste it below', detail: 'Enter it in the field below and save. Live order syncing activates once our Grubhub partnership is finalized.' },
    ],
    applyUrl: 'https://restaurant.grubhub.com',
    applyLabel: 'Apply to become a Grubhub partner',
  },
  instacart: {
    color: '#43B02A', abbr: 'IC', bgColor: 'bg-green-500',
    storeIdLabel: 'Instacart Store ID',
    storeIdPlaceholder: 'e.g. 98765',
    verifiable: false,
    steps: [
      { text: 'Log in to the Instacart Retailer Portal', detail: 'Go to retailers.instacart.com and sign in with your Instacart business account.' },
      { text: 'Go to Store Settings', detail: 'Click your store name in the top menu, then navigate to Settings → Store Information.' },
      { text: 'Copy your Store ID', detail: 'Your Store ID is displayed in the Store Information section or in the URL bar.' },
      { text: 'Paste it below and save', detail: 'Live order syncing activates once our Instacart Connect partnership is finalized.' },
    ],
    applyUrl: 'https://partner.instacart.com',
    applyLabel: 'Apply to become an Instacart partner',
  },
}

function ProviderIcon({ provider, size = 'md' }: { provider: string; size?: 'sm' | 'md' }) {
  const meta = PROVIDER_META[provider]
  const sz = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-11 h-11 text-sm'
  return (
    <div className={`${sz} rounded-xl ${meta?.bgColor ?? 'bg-gray-400'} flex items-center justify-center text-white font-bold shrink-0`}>
      {meta?.abbr ?? '?'}
    </div>
  )
}

function ConnectForm({ provider, name, onConnected }: { provider: string; name: string; onConnected: () => void }) {
  const meta = PROVIDER_META[provider]
  const [open, setOpen] = useState(false)
  const [storeId, setStoreId] = useState('')
  const [state, setState] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!storeId.trim()) { setMessage('Please enter your Store ID'); return }
    setState('verifying'); setMessage('')
    try {
      const res = await api.delivery.verify(provider, storeId.trim())
      setState('success')
      setMessage(res.message ?? (res.verified ? `Connected and verified with ${name}!` : `Store ID saved. Integration activates once partnership is approved.`))
      setTimeout(() => { setOpen(false); onConnected() }, 1800)
    } catch (e: unknown) {
      setState('error')
      setMessage(e instanceof Error ? e.message : 'Connection failed')
    }
  }

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
    >
      Connect
    </button>
  )

  return (
    <div className="mt-5 border border-gray-200 rounded-2xl overflow-hidden">
      {/* Instructions */}
      <div className="bg-gray-50 border-b border-gray-200 px-5 py-4">
        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">How to find your {name} Store ID</p>
        <ol className="space-y-3">
          {meta.steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-green-100 text-green-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
              <div>
                <p className="text-xs font-semibold text-gray-800">{s.text}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* Input */}
      <form onSubmit={submit} className="px-5 py-4 space-y-3 bg-white">
        {!meta.verifiable && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Live order syncing for {name} activates once the Careful Server × {name} partnership is finalized. Your Store ID will be ready to go the moment it is.
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">{meta.storeIdLabel}</label>
          <input
            type="text"
            value={storeId}
            onChange={e => setStoreId(e.target.value)}
            placeholder={meta.storeIdPlaceholder}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            autoComplete="off"
          />
        </div>
        {message && (
          <p className={`text-xs rounded-lg px-3 py-2 ${
            state === 'error'   ? 'text-red-600 bg-red-50 border border-red-200' :
            state === 'success' ? 'text-green-700 bg-green-50 border border-green-200' :
                                  'text-gray-500'
          }`}>{message}</p>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={state === 'verifying' || state === 'success'}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            {state === 'verifying' && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {state === 'verifying' ? 'Verifying…' : meta.verifiable ? 'Verify & Connect' : 'Save & Link'}
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); setState('idle'); setMessage('') }}
            className="bg-white border border-gray-200 text-gray-500 hover:text-gray-700 px-3 py-2 rounded-lg text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
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
    if (!confirm(`Disconnect ${PROVIDER_META[provider]?.abbr ?? provider}?`)) return
    setDisconnecting(provider)
    try { await api.delivery.disconnect(provider); await load() }
    catch { /* ignore */ }
    finally { setDisconnecting(null) }
  }

  const providerOrder = ['doordash', 'ubereats', 'grubhub', 'instacart']

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Delivery Integrations</h1>
        <p className="text-sm text-gray-400 mt-0.5">Connect your restaurant to delivery platforms so orders flow in automatically.</p>
      </div>

      {loading && <div className="text-sm text-gray-400 py-12 text-center">Loading…</div>}
      {error   && <div className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl p-4">{error}</div>}

      {!loading && !error && (
        <div className="space-y-4">
          {providerOrder.map(key => {
            const p = providers[key]
            const meta = PROVIDER_META[key]
            if (!p || !meta) return null
            const isLinked   = p.status === 'linked'
            const isConnected = p.status === 'connected'

            return (
              <div key={key} className="bg-white rounded-2xl border border-gray-200 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ProviderIcon provider={key} />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                      {isConnected && (
                        <p className="text-xs text-green-600 flex items-center gap-1 mt-0.5">
                          <span className="w-1.5 h-1.5 bg-green-500 rounded-full inline-block" />
                          Connected {p.store_id ? `· Store ${p.store_id}` : ''}
                        </p>
                      )}
                      {isLinked && (
                        <p className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                          <span className="w-1.5 h-1.5 bg-amber-400 rounded-full inline-block" />
                          Linked · Integration coming soon
                        </p>
                      )}
                      {!isConnected && !isLinked && (
                        <p className="text-xs text-gray-400 mt-0.5">Not connected</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {isConnected && <span className="text-xs bg-green-100 text-green-700 px-2.5 py-0.5 rounded-full font-medium">Active</span>}
                    {isLinked    && <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-0.5 rounded-full font-medium">Pending</span>}
                    {(isConnected || isLinked) ? (
                      <button
                        onClick={() => disconnect(key)}
                        disabled={disconnecting === key}
                        className="text-sm text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-200 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {disconnecting === key ? 'Removing…' : 'Disconnect'}
                      </button>
                    ) : (
                      <ConnectForm provider={key} name={p.name} onConnected={load} />
                    )}
                  </div>
                </div>

                {!isConnected && !isLinked && (
                  <p className="text-xs text-gray-400 mt-3">
                    Don&apos;t have a merchant account?{' '}
                    <a href={meta.applyUrl} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline">
                      {meta.applyLabel} →
                    </a>
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
