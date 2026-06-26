'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { api, StaffMessage, ChatGroup, LiveData } from '@/lib/api'

const ACCENT = '#16a34a'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function displayContent(content: string): string {
  // Old messages were encrypted client-side — show a fallback for unreadable base64.
  if (content.length > 50 && /^[A-Za-z0-9+/]{50,}$/.test(content) && !content.includes(' ')) {
    return '[legacy encrypted message]'
  }
  return content
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function isImageContent(m: StaffMessage): boolean {
  return m.message_type === 'image' && m.content.startsWith('data:image')
}

// Resize an image File to a max width and return a JPEG data URL.
async function compressImage(file: File, maxWidth = 800, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const scale = img.width > maxWidth ? maxWidth / img.width : 1
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('Canvas unsupported')); return }
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = () => reject(new Error('Image load failed'))
      img.src = reader.result as string
    }
    reader.onerror = () => reject(new Error('File read failed'))
    reader.readAsDataURL(file)
  })
}

// ─── Group Guidelines modal (one-time when creating) ──────────────────────────

function GroupGuidelinesModal({ onConfirm, onCancel, working }: { onConfirm: () => void; onCancel: () => void; working: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-6">
      <div className="bg-[#0f172a] border border-white/10 rounded-2xl p-7 w-full max-w-sm">
        <h2 className="text-white text-lg font-bold mb-4">Group Chat Guidelines</h2>
        <p className="text-[#94a3b8] text-sm mb-3">By creating this group, you and all members agree:</p>
        <ul className="text-[#94a3b8] text-sm space-y-2 mb-6 list-disc pl-5">
          <li>Business goals and customer service remain the priority</li>
          <li>This chat is for work-related communication</li>
          <li>Chats that consistently detract from business objectives may be dissolved</li>
        </ul>
        <button
          onClick={onConfirm}
          disabled={working}
          className="w-full py-3.5 rounded-2xl text-white font-bold text-sm transition-colors disabled:opacity-50 mb-2"
          style={{ backgroundColor: ACCENT }}
        >
          {working ? 'Creating...' : 'I understand, create the group'}
        </button>
        <button onClick={onCancel} disabled={working} className="w-full py-3 text-[#64748b] text-sm hover:text-[#94a3b8] transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Create / Join modal ──────────────────────────────────────────────────────

function GroupModal({
  onClose,
  onCreated,
  onJoined,
}: {
  onClose: () => void
  onCreated: (g: { id: number; name: string; invite_code: string }) => void
  onJoined: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [code, setCode] = useState('')
  const [showGuidelines, setShowGuidelines] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [createdCode, setCreatedCode] = useState('')
  const [copied, setCopied] = useState(false)

  async function doCreate() {
    setWorking(true)
    setError('')
    try {
      const g = await api.staff.createGroup(name.trim(), description.trim())
      setCreatedCode(g.invite_code)
      setShowGuidelines(false)
      onCreated(g)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create group')
      setShowGuidelines(false)
    } finally {
      setWorking(false)
    }
  }

  async function doJoin() {
    if (!code.trim()) return
    setWorking(true)
    setError('')
    try {
      await api.staff.joinGroup(code.trim())
      onJoined()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to join group')
    } finally {
      setWorking(false)
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(createdCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  if (showGuidelines) {
    return <GroupGuidelinesModal onConfirm={doCreate} onCancel={() => setShowGuidelines(false)} working={working} />
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-6">
      <div className="bg-[#0f172a] border border-white/10 rounded-2xl p-6 w-full max-w-sm max-h-[90vh] overflow-y-auto">
        {createdCode ? (
          <div>
            <h2 className="text-white text-lg font-bold mb-3">Group Created</h2>
            <p className="text-[#94a3b8] text-sm mb-2">Share this code with teammates:</p>
            <div className="flex items-center gap-2 mb-5">
              <code className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-lg font-mono font-bold tracking-widest text-[#16a34a] text-center">
                {createdCode}
              </code>
              <button onClick={copyCode} className="px-3 py-2.5 text-xs text-white border border-white/10 rounded-xl hover:border-white/25 transition-colors">
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <button onClick={onClose} className="w-full py-3 rounded-2xl text-white font-bold text-sm" style={{ backgroundColor: ACCENT }}>
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-white text-lg font-bold">Groups</h2>
              <button onClick={onClose} className="text-[#64748b] text-sm hover:text-white">Close</button>
            </div>

            {error && (
              <div className="bg-red-900/30 border border-red-700/40 rounded-xl px-3 py-2 text-red-300 text-sm mb-4">{error}</div>
            )}

            <p className="text-white text-sm font-semibold mb-2">Create New Group</p>
            <input
              type="text"
              placeholder="Group name"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-white/20 mb-2"
            />
            <input
              type="text"
              placeholder="Optional description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-white/20 mb-3"
            />
            <button
              onClick={() => name.trim() && setShowGuidelines(true)}
              disabled={!name.trim()}
              className="w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-40 transition-opacity mb-6"
              style={{ backgroundColor: ACCENT }}
            >
              Create
            </button>

            <div className="h-px bg-white/10 mb-6" />

            <p className="text-white text-sm font-semibold mb-2">Join a Group</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Invite code"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-white/20 font-mono"
              />
              <button
                onClick={doJoin}
                disabled={working || !code.trim()}
                className="px-4 py-2.5 rounded-xl border border-white/10 text-white text-sm font-medium disabled:opacity-40 hover:border-white/25 transition-colors"
              >
                Join
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Group Info screen ────────────────────────────────────────────────────────

function GroupInfo({
  group,
  onClose,
  onLeft,
}: {
  group: ChatGroup
  onClose: () => void
  onLeft: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [copied, setCopied] = useState(false)

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(group.invite_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  async function leave() {
    setLeaving(true)
    try {
      await api.staff.leaveGroup(group.id)
      onLeft()
    } catch { /* ignore */ } finally {
      setLeaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-6">
      <div className="bg-[#0f172a] border border-white/10 rounded-2xl p-6 w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white text-lg font-bold truncate">{group.name}</h2>
          <button onClick={onClose} className="text-[#64748b] text-sm hover:text-white">Close</button>
        </div>
        {group.description && <p className="text-[#94a3b8] text-sm mb-4">{group.description}</p>}

        <p className="text-[#64748b] text-xs mb-1">Members</p>
        <p className="text-white text-sm mb-4">{group.member_count} member{group.member_count === 1 ? '' : 's'}</p>

        <p className="text-[#64748b] text-xs mb-1">Invite Code</p>
        <div className="flex items-center gap-2 mb-6">
          <code className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm font-mono tracking-widest text-[#16a34a] text-center">
            {group.invite_code}
          </code>
          <button onClick={copyCode} className="px-3 py-2 text-xs text-white border border-white/10 rounded-xl hover:border-white/25 transition-colors">
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        {confirming ? (
          <div className="space-y-2">
            <p className="text-[#94a3b8] text-sm text-center">Leave this group?</p>
            <button
              onClick={leave}
              disabled={leaving}
              className="w-full py-3 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm disabled:opacity-50 transition-colors"
            >
              {leaving ? 'Leaving...' : 'Yes, Leave Group'}
            </button>
            <button onClick={() => setConfirming(false)} className="w-full py-2.5 text-[#64748b] text-sm hover:text-white">
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="w-full py-3 rounded-2xl border border-red-900/50 text-red-400 font-semibold text-sm hover:bg-red-900/20 transition-colors"
          >
            Leave Group
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MessagesPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [groups, setGroups] = useState<ChatGroup[]>([])
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null) // null = Team (main channel)
  const [messages, setMessages] = useState<StaffMessage[]>([])
  const [live, setLive] = useState<LiveData | null>(null)
  const [myUserId, setMyUserId] = useState<number | null>(null)

  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [showGroupInfo, setShowGroupInfo] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const activeGroup = groups.find(g => g.id === activeGroupId) ?? null

  // ── Auth check + initial load ──
  const load = useCallback(async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    if (!token) {
      router.replace('/app/login')
      return
    }
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      setMyUserId(payload.sub ? Number(payload.sub) : null)
    } catch { setMyUserId(null) }

    try {
      const [grps, liveData, msgs] = await Promise.all([
        api.staff.getGroups(),
        api.staff.getLive(),
        api.staff.getMessages(),
      ])
      setGroups(grps)
      setLive(liveData)
      setMessages(msgs)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load'
      if (msg.includes('Session expired')) { router.replace('/app/login'); return }
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => { load() }, [load])

  // ── Load messages when switching channel ──
  const loadMessages = useCallback(async (groupId: number | null) => {
    try {
      const msgs = await api.staff.getMessages(groupId ?? undefined)
      setMessages(msgs)
    } catch { /* keep prior */ }
  }, [])

  useEffect(() => {
    loadMessages(activeGroupId)
  }, [activeGroupId, loadMessages])

  // ── Poll messages every 30s for active channel ──
  useEffect(() => {
    const iv = setInterval(() => loadMessages(activeGroupId), 30000)
    return () => clearInterval(iv)
  }, [activeGroupId, loadMessages])

  // ── Refresh business goal every 60s ──
  useEffect(() => {
    const iv = setInterval(async () => {
      try { setLive(await api.staff.getLive()) } catch { /* ignore */ }
    }, 60000)
    return () => clearInterval(iv)
  }, [])

  // ── Scroll to bottom ──
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(content: string, type: 'text' | 'image') {
    if (!content.trim()) return
    setSending(true)
    setError('')
    try {
      const msg = await api.staff.sendMessage(content, activeGroupId ?? undefined, type)
      setMessages(prev => [msg, ...prev])
      if (type === 'text') setInput('')
      setImagePreview(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    try {
      const dataUrl = await compressImage(file)
      setImagePreview(dataUrl)
    } catch {
      setError('Could not process image')
    }
  }

  const goalText = (() => {
    const g = live?.goals?.[0]
    if (!g) return null
    const pct = g.target_value > 0 ? Math.round((g.current_value / g.target_value) * 100) : 0
    return `${g.title}: ${g.target_value} — ${g.current_value} completed (${pct}%)`
  })()

  const isMine = (m: StaffMessage) => myUserId != null && m.from_user_id === myUserId

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#020617] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-[#16a34a] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-[#020617]">
      {/* Tab bar */}
      <div className="flex-none border-b border-white/5 bg-[#020617]">
        <div className="flex items-center justify-between px-3 py-2">
          <button onClick={() => router.push('/app/kiosk')} className="text-[#64748b] text-xs hover:text-white px-2 py-1">
            Back
          </button>
          <span className="text-white text-sm font-semibold">Messages</span>
          <span className="w-10" />
        </div>
        <div className="flex gap-2 px-3 pb-2 overflow-x-auto">
          <button
            onClick={() => setActiveGroupId(null)}
            className={`flex-none px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activeGroupId === null ? 'text-white' : 'bg-[#1e293b] text-[#94a3b8]'
            }`}
            style={activeGroupId === null ? { backgroundColor: ACCENT } : {}}
          >
            Team
          </button>
          {groups.map(g => (
            <button
              key={g.id}
              onClick={() => setActiveGroupId(g.id)}
              className={`flex-none px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
                activeGroupId === g.id ? 'text-white' : 'bg-[#1e293b] text-[#94a3b8]'
              }`}
              style={activeGroupId === g.id ? { backgroundColor: ACCENT } : {}}
            >
              <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold">
                {g.name.charAt(0).toUpperCase()}
              </span>
              {g.name}
            </button>
          ))}
          <button
            onClick={() => setShowGroupModal(true)}
            className="flex-none px-3 py-1.5 rounded-full text-xs font-medium bg-[#1e293b] text-[#94a3b8] hover:text-white transition-colors"
          >
            + New Group
          </button>
        </div>
      </div>

      {/* Conversation header */}
      <div className="flex-none px-4 py-2.5 border-b border-white/5">
        <button
          onClick={() => activeGroup && setShowGroupInfo(true)}
          disabled={!activeGroup}
          className="flex items-center gap-2 disabled:cursor-default"
        >
          <span className="text-white text-sm font-semibold">
            {activeGroup ? activeGroup.name : 'Team Channel'}
          </span>
          <span className="text-[#64748b] text-xs">
            {activeGroup ? `${activeGroup.member_count} members` : 'All staff'}
          </span>
        </button>
      </div>

      {/* Business goal banner (always shown) */}
      <div className="flex-none px-4 py-2 bg-[#0f172a] border-b border-white/5 flex items-center gap-2">
        <svg className="w-4 h-4 text-[#16a34a] flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
        </svg>
        <p className="text-[#94a3b8] text-xs truncate">
          {goalText ? <>Today&apos;s Goal: {goalText}</> : 'Today’s Goal: stay focused on great service'}
        </p>
      </div>

      {error && (
        <div className="flex-none bg-red-900/30 border-b border-red-700/40 px-4 py-2 text-red-300 text-sm">{error}</div>
      )}

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 ? (
          <p className="text-[#64748b] text-sm text-center py-10">No messages yet. Say hello to your team.</p>
        ) : (
          [...messages].reverse().map(m => {
            const mine = isMine(m)
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[78%] flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  <p className="text-[#64748b] text-xs mb-1 px-1">
                    {mine ? 'You' : m.from_name} &middot; {formatTime(m.created_at)}
                  </p>
                  {isImageContent(m) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.content}
                      alt="shared"
                      className="rounded-2xl max-w-full max-h-64 border border-white/10"
                    />
                  ) : (
                    <div
                      className="rounded-2xl px-3.5 py-2 text-sm leading-relaxed text-white"
                      style={{ backgroundColor: mine ? ACCENT : '#1e293b' }}
                    >
                      {displayContent(m.content)}
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Image preview before sending */}
      {imagePreview && (
        <div className="flex-none px-4 py-2 border-t border-white/5 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imagePreview} alt="preview" className="w-16 h-16 rounded-xl object-cover border border-white/10" />
          <button
            onClick={() => send(imagePreview, 'image')}
            disabled={sending}
            className="px-4 py-2 rounded-xl text-white text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: ACCENT }}
          >
            {sending ? 'Sending...' : 'Send Image'}
          </button>
          <button onClick={() => setImagePreview(null)} className="px-3 py-2 text-[#64748b] text-sm hover:text-white">
            Cancel
          </button>
        </div>
      )}

      {/* Input bar */}
      <div className="flex-none px-3 py-3 border-t border-white/5 bg-[#020617] flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onFileSelected}
          className="hidden"
        />
        <button
          onClick={() => fileRef.current?.click()}
          className="flex-none w-10 h-10 rounded-xl bg-[#1e293b] flex items-center justify-center text-[#94a3b8] hover:text-white transition-colors"
          aria-label="Attach image"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M18 9.75h.008v.008H18V9.75z" />
          </svg>
        </button>
        <input
          type="text"
          placeholder="Message..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input, 'text') } }}
          className="flex-1 bg-[#1e293b] border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-white/20"
        />
        <button
          onClick={() => send(input, 'text')}
          disabled={sending || !input.trim()}
          className="flex-none px-4 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-40 transition-opacity"
          style={{ backgroundColor: ACCENT }}
        >
          Send
        </button>
      </div>

      {showGroupModal && (
        <GroupModal
          onClose={() => setShowGroupModal(false)}
          onCreated={async () => { await load() }}
          onJoined={async () => { await load() }}
        />
      )}

      {showGroupInfo && activeGroup && (
        <GroupInfo
          group={activeGroup}
          onClose={() => setShowGroupInfo(false)}
          onLeft={async () => {
            setShowGroupInfo(false)
            setActiveGroupId(null)
            await load()
          }}
        />
      )}
    </div>
  )
}
