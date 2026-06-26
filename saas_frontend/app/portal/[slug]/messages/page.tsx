'use client'
import { useEffect, useState, useCallback, useContext, useRef } from 'react'
import { api, StaffMessage, ChatGroup } from '@/lib/api'
import { getRole } from '@/lib/auth'
import { CustomizationContext } from '../tenant-context'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function displayContent(content: string): string {
  // Old messages were encrypted client-side — show a fallback for unreadable base64.
  if (content.length > 50 && /^[A-Za-z0-9+/]{50,}$/.test(content) && !content.includes(' ')) {
    return '[legacy encrypted message]'
  }
  return content
}

function isImageContent(m: StaffMessage): boolean {
  return m.message_type === 'image' && m.content.startsWith('data:image')
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
  const customization = useContext(CustomizationContext)
  const accent = customization.accent_color || '#16a34a'
  const role = getRole()
  const dark = customization.dark_mode

  const [messages, setMessages] = useState<StaffMessage[]>([])
  const [groups, setGroups] = useState<ChatGroup[]>([])
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [joinCode, setJoinCode] = useState('')

  const myUserIdRef = useRef<number | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const [m, grps] = await Promise.all([api.staff.getMessages(), api.staff.getGroups()])
      setMessages(m)
      setGroups(grps)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load messages')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const loadMessages = useCallback(async (groupId: number | null) => {
    try {
      const m = await api.staff.getMessages(groupId ?? undefined)
      setMessages(m)
    } catch { /* keep prior */ }
  }, [])

  useEffect(() => { loadMessages(activeGroupId) }, [activeGroupId, loadMessages])

  // Auto-refresh every 20 seconds
  useEffect(() => {
    const iv = setInterval(() => loadMessages(activeGroupId), 20000)
    return () => clearInterval(iv)
  }, [activeGroupId, loadMessages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    const text = input.trim()
    if (!text) return
    setSending(true)
    setError('')
    try {
      const msg = await api.staff.sendMessage(text, activeGroupId ?? undefined)
      if (myUserIdRef.current === null) myUserIdRef.current = msg.from_user_id
      setMessages(prev => [msg, ...prev])
      setInput('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  async function joinGroup() {
    if (!joinCode.trim()) return
    try {
      const res = await api.staff.joinGroup(joinCode.trim())
      setJoinCode('')
      await load()
      setActiveGroupId(res.group_id)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to join group')
    }
  }

  const isMyMessage = (m: StaffMessage): boolean =>
    myUserIdRef.current !== null && m.from_user_id === myUserIdRef.current

  const grouped = groupByDate(messages)

  const bgCard = dark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
  const bgOther = dark ? '#273447' : '#f3f4f6'
  const textOther = dark ? '#f1f5f9' : '#111827'

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-140px)] min-h-[500px]">
      {/* Sidebar: channels / groups */}
      <div className={`lg:w-56 flex-none border rounded-xl ${bgCard} shadow-sm p-3 overflow-y-auto`}>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">Channels</p>
        <button
          onClick={() => setActiveGroupId(null)}
          className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium mb-1 transition-colors ${activeGroupId === null ? 'text-white' : 'text-gray-700 hover:bg-gray-100'}`}
          style={activeGroupId === null ? { backgroundColor: accent } : {}}
        >
          Team
        </button>
        {groups.map(g => (
          <button
            key={g.id}
            onClick={() => setActiveGroupId(g.id)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium mb-1 transition-colors truncate ${activeGroupId === g.id ? 'text-white' : 'text-gray-700 hover:bg-gray-100'}`}
            style={activeGroupId === g.id ? { backgroundColor: accent } : {}}
          >
            {g.name}
          </button>
        ))}
        <div className="h-px bg-gray-200 my-3" />
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">Join Group</p>
        <div className="flex gap-1.5">
          <input
            type="text"
            placeholder="Code"
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-2"
          />
          <button
            onClick={joinGroup}
            disabled={!joinCode.trim()}
            className="px-3 py-1.5 text-white text-xs font-medium rounded-lg disabled:opacity-50 hover:opacity-90 transition-opacity"
            style={{ backgroundColor: accent }}
          >
            Join
          </button>
        </div>
      </div>

      {/* Main conversation */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className={`flex-none flex items-center justify-between px-5 py-4 rounded-t-xl border ${bgCard} shadow-sm mb-0`}>
          <div>
            <h1 className="text-lg font-bold text-gray-900">
              {activeGroupId === null ? 'Staff Messages' : (groups.find(g => g.id === activeGroupId)?.name ?? 'Group')}
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {activeGroupId === null ? 'Visible to your whole team' : 'Private group chat'}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Encrypted
          </span>
        </div>

        {error && (
          <div className="flex-none mt-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">{error}</div>
        )}

        {/* Messages area */}
        <div className={`flex-1 overflow-y-auto border-x ${dark ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-gray-50'} px-4 py-4 space-y-4`}>
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-6 h-6 border-2 border-gray-200 rounded-full animate-spin" style={{ borderTopColor: accent }} />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-2">
              <p className="text-sm text-gray-500 font-medium">No messages yet.</p>
              <p className="text-xs text-gray-400">Send the first message to your team.</p>
            </div>
          ) : (
            grouped.map(group => (
              <div key={group.date} className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className={`flex-1 h-px ${dark ? 'bg-gray-700' : 'bg-gray-200'}`} />
                  <span className={`text-xs px-2 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>{group.date}</span>
                  <div className={`flex-1 h-px ${dark ? 'bg-gray-700' : 'bg-gray-200'}`} />
                </div>

                {group.msgs.map(m => {
                  const mine = isMyMessage(m)
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] space-y-1 ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                        <div className="flex items-center gap-1.5">
                          {!mine && <span className="text-xs font-medium text-gray-500">{m.from_name}</span>}
                          <span className={`text-xs ${dark ? 'text-gray-500' : 'text-gray-400'}`}>{formatTime(m.created_at)}</span>
                          {mine && <span className="text-xs font-medium text-gray-500">You</span>}
                        </div>
                        {isImageContent(m) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.content} alt="shared" className="rounded-2xl max-w-full max-h-64 border border-gray-200" />
                        ) : (
                          <div
                            className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${mine ? 'rounded-tr-sm text-white' : 'rounded-tl-sm'}`}
                            style={mine ? { backgroundColor: accent } : { backgroundColor: bgOther, color: textOther }}
                          >
                            {displayContent(m.content)}
                          </div>
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
              e.target.style.height = 'auto'
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
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

        {role === 'viewer' && (
          <p className="text-xs text-gray-400 text-center mt-2">Viewers can read messages but cannot send.</p>
        )}
      </div>
    </div>
  )
}
