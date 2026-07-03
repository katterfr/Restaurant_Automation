'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { api } from '@/lib/api'

interface ApiKeyEntry {
  service: string
  label: string
  masked: string
  updated_at: string
}

const SERVICE_INFO: Record<string, { label: string; description: string; docsUrl: string; placeholder: string }> = {
  replicate: {
    label: 'Replicate API Token',
    description: 'Powers AI Creative Studio — image and video generation. Sign up at replicate.com, go to Account → API Tokens.',
    docsUrl: 'https://replicate.com/account/api-tokens',
    placeholder: 'r8_••••••••••••••••••••••••••••••••••••••••',
  },
  vapi: {
    label: 'VAPI API Key',
    description: 'Powers the AI Phone Agent — voice ordering via phone. Sign up at vapi.ai, go to Dashboard → API Keys.',
    docsUrl: 'https://vapi.ai',
    placeholder: 'vapi-••••••••••••••••••••••••••••••••••••••',
  },
}

export default function SettingsPage() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug ?? ''

  const [keys, setKeys] = useState<ApiKeyEntry[]>([])
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [deleting, setDeleting] = useState<Record<string, boolean>>({})
  const [messages, setMessages] = useState<Record<string, { text: string; ok: boolean }>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.tenantKeys.list()
      .then(setKeys)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function keyMap(): Record<string, ApiKeyEntry> {
    return Object.fromEntries(keys.map(k => [k.service, k]))
  }

  function setMsg(service: string, text: string, ok: boolean) {
    setMessages(m => ({ ...m, [service]: { text, ok } }))
    setTimeout(() => setMessages(m => { const n = { ...m }; delete n[service]; return n }), 4000)
  }

  async function handleSave(service: string) {
    const key = (inputs[service] || '').trim()
    if (!key) return
    setSaving(s => ({ ...s, [service]: true }))
    try {
      const res = await api.tenantKeys.save(service, key)
      setKeys(prev => {
        const existing = prev.find(k => k.service === service)
        if (existing) return prev.map(k => k.service === service ? { ...k, masked: res.masked, updated_at: new Date().toISOString() } : k)
        return [...prev, { service, label: SERVICE_INFO[service]?.label ?? service, masked: res.masked, updated_at: new Date().toISOString() }]
      })
      setInputs(i => ({ ...i, [service]: '' }))
      setMsg(service, 'API key saved', true)
    } catch (e: unknown) {
      setMsg(service, e instanceof Error ? e.message : 'Failed to save', false)
    } finally {
      setSaving(s => ({ ...s, [service]: false }))
    }
  }

  async function handleDelete(service: string) {
    setDeleting(d => ({ ...d, [service]: true }))
    try {
      await api.tenantKeys.delete(service)
      setKeys(prev => prev.filter(k => k.service !== service))
      setMsg(service, 'API key removed', true)
    } catch (e: unknown) {
      setMsg(service, e instanceof Error ? e.message : 'Failed to remove', false)
    } finally {
      setDeleting(d => ({ ...d, [service]: false }))
    }
  }

  const existing = keyMap()

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your restaurant account settings and API integrations.</p>
      </div>

      {/* API Keys */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">API Keys</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Add your own API keys to enable AI features. You are billed directly by each provider — CarefulServer does not mark up usage costs.
          </p>
        </div>

        {loading ? (
          <div className="px-6 py-8 text-center text-sm text-gray-400">Loading…</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {Object.entries(SERVICE_INFO).map(([service, info]) => {
              const saved = existing[service]
              return (
                <div key={service} className="px-6 py-5 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{info.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{info.description}</p>
                      <a
                        href={info.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline mt-0.5 inline-block"
                      >
                        Get your API key →
                      </a>
                    </div>
                    {saved && (
                      <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium mt-0.5">
                        Connected
                      </span>
                    )}
                  </div>

                  {saved && (
                    <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-2.5">
                      <code className="text-xs text-gray-600 font-mono flex-1">{saved.masked}</code>
                      <button
                        onClick={() => handleDelete(service)}
                        disabled={deleting[service]}
                        className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
                      >
                        {deleting[service] ? 'Removing…' : 'Remove'}
                      </button>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={inputs[service] ?? ''}
                      onChange={e => setInputs(i => ({ ...i, [service]: e.target.value }))}
                      placeholder={saved ? 'Enter new key to replace…' : info.placeholder}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 font-mono"
                    />
                    <button
                      onClick={() => handleSave(service)}
                      disabled={!inputs[service]?.trim() || saving[service]}
                      className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                    >
                      {saving[service] ? 'Saving…' : saved ? 'Update' : 'Save'}
                    </button>
                  </div>

                  {messages[service] && (
                    <p className={`text-xs ${messages[service].ok ? 'text-green-600' : 'text-red-600'}`}>
                      {messages[service].ok ? '✓' : '✗'} {messages[service].text}
                    </p>
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
