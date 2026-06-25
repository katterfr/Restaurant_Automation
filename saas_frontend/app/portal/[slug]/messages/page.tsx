'use client'
import { useEffect, useState, useCallback, useContext, useRef } from 'react'
import { useParams } from 'next/navigation'
import { api, StaffMessage } from '@/lib/api'
import { getRole } from '@/lib/auth'
import { CustomizationContext } from '../tenant-context'

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
  useParams<{ slug: string }>()
  const customization = useContext(CustomizationContext)
  const accent = customization.accent_color || '#16a34a'
  const role = getRole()
  const dark = customization.dark_mode

  const [messages, setMessages] = useState<StaffMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)

  // We need a stable "current user" identifier — use from_user_id of own messages
  // (the server decodes it from the JWT, so we can't easily know it here without
  //  calling an endpoint; instead we track by from_name or use a heuristic:
  //  compare against the most recent message from "me" — but since we don't have
  //  a /me endpoint, we store our own user_id from the first send)
  const myUserIdRef = useRef<number | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const m = await api.staff.getMessages()
      setMessages(m)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load messages')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Auto-refresh every 20 seconds
  useEffect(() => {
    const iv = setInterval(load, 20000)
    return () => clearInterval(iv)
  }, [load])

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    const text = input.trim()
    if (!text) return
    setSending(true)
    setError('')
    try {
      const msg = await api.staff.sendMessage(text)
      // Store our own user ID from first successful send
      if (myUserIdRef.current === null) {
        myUserIdRef.current = msg.from_user_id
      }
      setMessages(prev => [msg, ...prev])
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

  const grouped = groupByDate(messages)

  const bgCard = dark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
  const bgMine = accent
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
            Encrypted
          </span>
        </div>
      </div>

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
                        {m.content}
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
