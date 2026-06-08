'use client'
import { useEffect, useState } from 'react'

const AUTOMATION_URL = 'https://automation-production-ddd0.up.railway.app'

interface AutomationConfig {
  restaurant_name: string
  timezone: string
  open_time: string
  close_time: string
  twilio_phone: string
  webhook_incoming: string
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={copy}
      className="shrink-0 text-xs px-2.5 py-1 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

function Row({ label, value, mono, copyable }: { label: string; value: string; mono?: boolean; copyable?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500 shrink-0 w-36">{label}</span>
      <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
        <span className={`text-sm text-gray-900 truncate ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
        {copyable && <CopyButton text={value} />}
      </div>
    </div>
  )
}

export default function PhoneAgentPage() {
  const [config, setConfig] = useState<AutomationConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`${AUTOMATION_URL}/config`)
      .then(r => r.json())
      .then(setConfig)
      .catch(() => setError('Could not reach automation service'))
      .finally(() => setLoading(false))
  }, [])

  const steps = [
    { done: !!config?.twilio_phone && config.twilio_phone !== 'not configured', label: 'Twilio phone number configured' },
    { done: false, label: 'Webhook URL set in Twilio console' },
    { done: false, label: 'Stripe account connected' },
  ]

  return (
    <div className="p-8 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Phone Agent</h1>
        <p className="text-sm text-gray-500 mt-1">AI-powered inbound call handler via Twilio + GPT-4o</p>
      </div>

      {/* Setup checklist */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Setup Checklist</h2>
        <ul className="space-y-3">
          {steps.map((s, i) => (
            <li key={i} className="flex items-center gap-3 text-sm">
              <span className={`flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold shrink-0 ${s.done ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                {s.done ? '✓' : i + 1}
              </span>
              <span className={s.done ? 'text-gray-500 line-through' : 'text-gray-700'}>{s.label}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Twilio setup */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Twilio Webhook Setup</h2>
        <p className="text-xs text-gray-400 mb-5">
          In your Twilio console → Phone Numbers → your number → Voice Configuration → paste the URL below as the webhook.
        </p>
        <div className="bg-gray-50 rounded-xl border border-gray-200 px-4 divide-y divide-gray-100">
          <Row
            label="Incoming calls"
            value={`${AUTOMATION_URL}/phone/incoming`}
            mono copyable
          />
          <Row
            label="HTTP Method"
            value="POST"
          />
        </div>
        <a
          href="https://console.twilio.com/us1/develop/phone-numbers/manage/incoming"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
        >
          Open Twilio console →
        </a>
      </div>

      {/* Current config */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Automation Service Config</h2>
        {loading && <p className="text-sm text-gray-400">Loading…</p>}
        {error && (
          <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2 border border-red-200">{error}</p>
        )}
        {config && (
          <div className="divide-y divide-gray-100">
            <Row label="Restaurant Name"  value={config.restaurant_name} />
            <Row label="Timezone"         value={config.timezone} />
            <Row label="Open Time"        value={config.open_time} />
            <Row label="Close Time"       value={config.close_time} />
            <Row label="Twilio Number"    value={config.twilio_phone} mono copyable />
            <Row label="Service URL"      value={AUTOMATION_URL} mono copyable />
          </div>
        )}
      </div>

      {/* How it works */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-blue-900 mb-3">How It Works</h2>
        <ol className="space-y-2 text-sm text-blue-800 list-decimal list-inside">
          <li>Customer calls your Twilio number</li>
          <li>Twilio sends a webhook to <span className="font-mono text-xs">/phone/incoming</span></li>
          <li>If restaurant is open, GPT-4o greets the caller and takes their order</li>
          <li>If closed, plays an after-hours message and takes a voicemail</li>
          <li>Completed orders are published to the event bus and stored</li>
        </ol>
      </div>
    </div>
  )
}
