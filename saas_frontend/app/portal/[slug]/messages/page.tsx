'use client'
import { useEffect, useState, useCallback, useContext, useRef } from 'react'
import { useParams } from 'next/navigation'
import { api, StaffMessage } from '@/lib/api'
import { getRole } from '@/lib/auth'
import { CustomizationContext } from '../tenant-context'

// ─── E2E Crypto helpers ───────────────────────────────────────────────────────

async function deriveKey(passphrase: string, salt: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(salt || 'careful-server-salt'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

async function encryptMsg(text: string, key: CryptoKey): Promise<string> {
  const enc = new TextEncoder()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text))
  const buf = new Uint8Array(iv.byteLength + ct.byteLength)
  buf.set(iv, 0); buf.set(new Uint8Array(ct), iv.byteLength)
  return btoa(String.fromCharCode(...buf))
}

async function decryptMsg(b64: string, key: CryptoKey): Promise<string> {
  try {
    const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    const iv = buf.slice(0, 12)
    const ct = buf.slice(12)
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
    return new TextDecoder().decode(pt)
  } catch { return '[encrypted]' }
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return 'Today'
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function groupByDate(messages: StaffMessage[]): { date: string; msgs: StaffMessage[] }[] {
  const map = new Map<string, StaffMessage[]>()
  for (const m of [...messages].reverse()) {
    const key = new Date(m.created_at).toDateString()
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(m)
  }
  return Array.from(map.entries()).map(([, msgs]) => ({
    date: formatDate(msgs[0].created_at),
    msgs,
  }))
}

export default function MessagesPage() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug ?? ''
  const customization = useContext(CustomizationContext)
  const accent = customization.accent_color || '#16a34a'
  const role = getRole()
  const dark = customization.dark_mode

  const [messages, setMessages] = useState<StaffMessage[]>([])
  const [decryptedMsgs, setDecryptedMsgs] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)

  // Crypto
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null)
  const [chatSalt, setChatSalt] = useState<string>('')
  const [passphrasePrompt, setPassphrasePrompt] = useState(false)
  const [passphraseInput, setPassphraseInput] = useState('')
  const [passphraseError, setPassphraseError] = useState('')

  const myUserIdRef = useRef<number | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Decrypt messages when key or messages change
  useEffect(() => {
    if (!cryptoKey) return
    const decrypt = async () => {
      const results: Record<number, string> = {}
      for (const m of messages) {
        results[m.id] = await decryptMsg(m.content, cryptoKey)
      }
      setDecryptedMsgs(results)
    }
    decrypt()
  }, [messages, cryptoKey])

  const load = useCallback(async () => {
    try {
      const [m, p] = await Promise.all([api.staff.getMessages(), api.staff.getPolicy()])
      setMessages(m)
      const salt = p.chat_salt || 'careful-server-salt'
      setChatSalt(salt)

      // Try to get stored passphrase
      const stored = typeof window !== 'undefined' ? localStorage.getItem(`cs_kiosk_passphrase_${slug}`) : null
      if (stored) {
        try {
          const key = await deriveKey(stored, salt)
          setCryptoKey(key)
        } catch {
          setPassphrasePrompt(true)
        }
      } else {
        setPassphrasePrompt(true)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load messages')
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => { load() }, [load])

  // Auto-refresh every 20 seconds
  useEffect(() => {
    const iv = setInterval(async () => {
      try {
        const m = await api.staff.getMessages()
        setMessages(m)
      } catch {}
    }, 20000)
    return () => clearInterval(iv)
  }, [])

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [decryptedMsgs])

  async function submitPassphrase() {
    if (!passphraseInput.trim()) return
    setPassphraseError('')
    try {
      const key = await deriveKey(passphraseInput.trim(), chatSalt)
      localStorage.setItem(`cs_kiosk_passphrase_${slug}`, passphraseInput.trim())
      setCryptoKey(key)
      setPassphrasePrompt(false)
    } catch (e: unknown) {
      setPassphraseError(e instanceof Error ? e.message : 'Invalid passphrase')
    }
  }

  async function sendMessage() {
    const text = input.trim()
    if (!text) return
    setSending(true)
    setError('')
    try {
      let content = text
      if (cryptoKey) {
        content = await encryptMsg(text, cryptoKey)
      }
      const msg = await api.staff.sendMessage(content)
      // Store our own user ID from first successful send
      if (myUserIdRef.current === null) {
        myUserIdRef.current = msg.from_user_id
      }
      // Show plaintext immediately for own message
      setMessages(prev => [msg, ...prev])
      setDecryptedMsgs(prev => ({ ...prev, [msg.id]: text }))
      setInput('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  const isMyMessage = (m: StaffMessage): boolean => {
    if (myUserIdRef.current !== null) return m.from_user_id === myUserIdRef.current
    return false
  }

  function displayContent(m: StaffMessage): string {
    if (cryptoKey && decryptedMsgs[m.id] !== undefined) return decryptedMsgs[m.id]
    return m.content
  }

  const grouped = groupByDate(messages)

  const bgCard = dark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
  const bgOther = dark ? '#273447' : '#f3f4f6'
  const textOther = dark ? '#f1f5f9' : '#111827'

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] min-h-[500px]">
      {/* Header */}
      <div className={`flex-none flex items-center justify-between px-5 py-4 rounded-t-xl border ${bgCard} shadow-sm mb-0`}>
        <div>
          <h1 className="text-lg font-bold text-gray-900">Staff Messages</h1>
          <p className="text-xs text-gray-400 mt-0.5">All messages visible to your restaurant team</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            End-to-end encrypted
          </span>
        </div>
      </div>

      {/* Passphrase prompt */}
      {passphrasePrompt && (
        <div className={`flex-none border-x border-b px-5 py-4 ${bgCard}`}>
          <p className="text-sm font-medium text-gray-700 mb-2">Enter team passphrase to read encrypted messages</p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Team passphrase"
              value={passphraseInput}
              onChange={e => { setPassphraseInput(e.target.value); setPassphraseError('') }}
              onKeyDown={e => { if (e.key === 'Enter') submitPassphrase() }}
              autoCapitalize="none"
              autoCorrect="off"
              className={`flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${dark ? 'bg-gray-800 border-gray-600 text-gray-100' : 'border-gray-300'}`}
            />
            <button
              onClick={submitPassphrase}
              disabled={!passphraseInput.trim()}
              className="px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ backgroundColor: accent }}
            >
              Unlock
            </button>
          </div>
          {passphraseError && <p className="text-red-500 text-xs mt-1">{passphraseError}</p>}
        </div>
      )}

      {error && (
        <div className="flex-none mx-0 mt-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      {/* Messages area */}
      <div className={`flex-1 overflow-y-auto border-x ${dark ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-gray-50'} px-4 py-4 space-y-4`}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-6 h-6 border-2 border-gray-200 rounded-full animate-spin" style={{ borderTopColor: accent }} />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400 text-xl">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-sm text-gray-500 font-medium">No messages yet.</p>
            <p className="text-xs text-gray-400">Send the first message to your team.</p>
          </div>
        ) : (
          grouped.map(group => (
            <div key={group.date} className="space-y-3">
              {/* Date divider */}
              <div className="flex items-center gap-3">
                <div className={`flex-1 h-px ${dark ? 'bg-gray-700' : 'bg-gray-200'}`} />
                <span className={`text-xs px-2 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>{group.date}</span>
                <div className={`flex-1 h-px ${dark ? 'bg-gray-700' : 'bg-gray-200'}`} />
              </div>

              {/* Messages in this date group */}
              {group.msgs.map(m => {
                const mine = isMyMessage(m)
                return (
                  <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] space-y-1 ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                      <div className="flex items-center gap-1.5">
                        {!mine && (
                          <span className="text-xs font-medium text-gray-500">{m.from_name}</span>
                        )}
                        <span className={`text-xs ${dark ? 'text-gray-500' : 'text-gray-400'}`}>{formatTime(m.created_at)}</span>
                        {mine && (
                          <span className="text-xs font-medium text-gray-500">You</span>
                        )}
                      </div>
                      <div
                        className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${mine ? 'rounded-tr-sm text-white' : 'rounded-tl-sm'}`}
                        style={mine
                          ? { backgroundColor: accent }
                          : { backgroundColor: bgOther, color: textOther }
                        }
                      >
                        {displayContent(m)}
                      </div>
                      {m.is_broadcast && !mine && (
                        <span className="text-xs text-gray-400">broadcast</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className={`flex-none flex items-end gap-3 px-4 py-3 border rounded-b-xl ${bgCard} shadow-sm`}>
        <textarea
          rows={1}
          placeholder="Send a message to your team..."
          value={input}
          onChange={e => {
            setInput(e.target.value)
            // Auto-grow
            e.target.style.height = 'auto'
            e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              sendMessage()
            }
          }}
          className={`flex-1 resize-none border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 overflow-hidden transition-all ${dark ? 'bg-gray-800 border-gray-600 text-gray-100 placeholder-gray-500' : 'border-gray-300 text-gray-900'}`}
          style={{ minHeight: '42px' }}
        />
        <button
          onClick={sendMessage}
          disabled={sending || !input.trim()}
          className="shrink-0 px-5 py-2.5 text-white text-sm font-medium rounded-xl disabled:opacity-50 hover:opacity-90 transition-opacity"
          style={{ backgroundColor: accent }}
        >
          {sending ? 'Sending...' : 'Send'}
        </button>
      </div>

      {/* Role note for non-staff */}
      {(role === 'viewer') && (
        <p className="text-xs text-gray-400 text-center mt-2">Viewers can read messages but cannot send.</p>
      )}
    </div>
  )
}
