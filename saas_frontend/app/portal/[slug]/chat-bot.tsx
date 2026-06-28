'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { api } from '@/lib/api'

type Attachment = { data: string; name: string; isImage: boolean }
type Msg = {
  role: 'user' | 'assistant'
  content: string
  image?: string
  navigate?: string | null
  action_result?: Record<string, unknown> | null
  is_feedback?: boolean
}
type Mode = 'bubble' | 'chat' | 'expanded'

const R      = 28
const CHAT_W = 380
const CHAT_H = 560
const EXP_W  = 680
const EXP_H  = 680

const OWNER_SUGGESTIONS = [
  "Post about today's special to Instagram",
  "Run a $10/day ad on Meta for our lunch menu",
  "How are my sales today?",
  "Add a menu item for me",
]

const EMPLOYEE_SUGGESTIONS = [
  "How are we doing on today's goals?",
  "Give me a customer service tip",
  "What's on the menu today?",
  "How do I advance to the next role?",
]

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }

export default function ChatBot({ accent, userName, userRole }: { accent: string; userName?: string; userRole?: string }) {
  const router   = useRouter()
  const pathname = usePathname()
  const slug     = pathname?.split('/')?.[2] ?? ''

  const [mode,       setMode]       = useState<Mode>('bubble')
  const [pos,        setPos]        = useState({ x: -1, y: -1 })
  const [msgs,       setMsgs]       = useState<Msg[]>([])
  const [input,      setInput]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const [submitingFbIdx, setSubmitingFbIdx] = useState<number | null>(null)
  const [submittedFbIdxs, setSubmittedFbIdxs] = useState<Set<number>>(new Set())

  const dragging  = useRef(false)
  const origin    = useRef({ mx: 0, my: 0, px: 0, py: 0 })
  const moved     = useRef(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)
  const fileRef   = useRef<HTMLInputElement>(null)

  // ── init position ────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem('portal_chat_pos')
      if (saved) {
        const p = JSON.parse(saved)
        setPos({ x: clamp(p.x, R, window.innerWidth - R), y: clamp(p.y, R, window.innerHeight - R) })
        return
      }
    } catch {}
    setPos({ x: window.innerWidth - 72, y: window.innerHeight - 72 })
  }, [])

  useEffect(() => { if (pos.x > 0) localStorage.setItem('portal_chat_pos', JSON.stringify(pos)) }, [pos])
  useEffect(() => { if (mode !== 'bubble') bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, mode])
  useEffect(() => { if (mode !== 'bubble') setTimeout(() => inputRef.current?.focus(), 120) }, [mode])

  // Log page interaction when chat is opened
  useEffect(() => {
    if (mode !== 'bubble') {
      api.feedback.logInteraction({ action: 'chat_opened', page: pathname || '' })
    }
  }, [mode, pathname])

  // ── drag ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return
      const dx = e.clientX - origin.current.mx
      const dy = e.clientY - origin.current.my
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved.current = true
      setPos({
        x: clamp(origin.current.px + dx, R, window.innerWidth  - R),
        y: clamp(origin.current.py + dy, R, window.innerHeight - R),
      })
    }
    function onUp() { dragging.current = false }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [])

  const startDrag = useCallback((e: React.MouseEvent) => {
    dragging.current = true; moved.current = false
    origin.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y }
    e.preventDefault()
  }, [pos])

  // ── file / image helpers ─────────────────────────────────────────────────
  function readFile(file: File) {
    const isImage = file.type.startsWith('image/')
    const reader  = new FileReader()
    if (isImage) {
      reader.onload = ev => setAttachment({ data: ev.target?.result as string, name: file.name, isImage: true })
      reader.readAsDataURL(file)
    } else {
      reader.onload = ev => setAttachment({ data: ev.target?.result as string, name: file.name, isImage: false })
      reader.readAsText(file)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) readFile(file)
    e.target.value = ''
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) { readFile(file); e.preventDefault() }
        return
      }
    }
  }

  const isEmployee = userRole === 'staff' || userRole === 'viewer'
  const SUGGESTIONS = isEmployee ? EMPLOYEE_SUGGESTIONS : OWNER_SUGGESTIONS

  // ── open ──────────────────────────────────────────────────────────────────
  function openChat() {
    if (moved.current) return
    setMode('chat')
    if (msgs.length === 0) {
      const greeting = isEmployee
        ? `Hi${userName ? ` ${userName}` : ''}! I'm Joyce, your personal work coach. I'm here to help you deliver great service, track your goals, and grow your career.\n\nAsk me anything — today's goal progress, customer service tips, menu info, or how to advance in your role.`
        : "Hi! I'm Joyce, your portal assistant — I can take action for you, not just give advice.\n\nI can post to your social media, launch ad campaigns, manage your menu, and search your orders — all automatically while you focus on other things. What would you like me to do?"
      setMsgs([{ role: 'assistant', content: greeting }])
    }
  }

  // ── submit chat feedback ──────────────────────────────────────────────────
  async function submitChatFeedback(msgIdx: number, content: string) {
    setSubmitingFbIdx(msgIdx)
    try {
      await api.feedback.submit({
        q1: undefined, q2: undefined, q3: undefined,
        star_rating: 5,
        comment: content.slice(0, 1000),
        user_role: 'owner',
      })
      setSubmittedFbIdxs(prev => new Set([...prev, msgIdx]))
    } catch {
      // silently fail — user can try the feedback modal instead
    } finally {
      setSubmitingFbIdx(null)
    }
  }

  // ── send ──────────────────────────────────────────────────────────────────
  async function send(text?: string) {
    const content = (text ?? input).trim()
    if ((!content && !attachment) || loading) return

    const userMsg: Msg = {
      role: 'user',
      content,
      ...(attachment?.isImage ? { image: attachment.data } : {}),
    }

    let finalContent = content
    if (attachment && !attachment.isImage) {
      finalContent = `[File: ${attachment.name}]\n${attachment.data}\n\n${content}`.trim()
      userMsg.content = finalContent
    }

    const next: Msg[] = [...msgs, userMsg]
    setMsgs(next)
    setInput('')
    setAttachment(null)
    setLoading(true)

    // Log the chat message interaction
    api.feedback.logInteraction({ action: 'chat_message_sent', page: pathname || '', metadata: { length: content.length } })

    try {
      const { reply, navigate, action_result, is_feedback } = await api.portal.chat(
        next.map(m => ({ role: m.role, content: m.content, ...(m.image ? { image: m.image } : {}) }))
      )
      setMsgs(prev => [...prev, { role: 'assistant', content: reply, navigate, action_result, is_feedback }])
      if (navigate && slug) {
        api.feedback.logInteraction({ action: 'chat_navigation', page: navigate })
        setTimeout(() => router.push(`/portal/${slug}/${navigate}`), 800)
      }
      if (action_result?.type) {
        api.feedback.logInteraction({ action: `chat_action_${action_result.type}`, page: pathname || '' })
      }
    } catch {
      setMsgs(prev => [...prev, { role: 'assistant', content: "Sorry, I ran into an error. Please try again." }])
    } finally {
      setLoading(false)
    }
  }

  if (pos.x < 0) return null

  const w  = mode === 'expanded' ? EXP_W : CHAT_W
  const h  = mode === 'expanded' ? EXP_H : CHAT_H
  const px = clamp(pos.x - w + R, 8, window.innerWidth  - w - 8)
  const py = clamp(pos.y - h - 16, 8, window.innerHeight - h - 8)

  return (
    <>
      {/* ── Bubble ── */}
      {mode === 'bubble' && (
        <button
          data-tour-id="chatbot-bubble"
          onMouseDown={startDrag}
          onClick={openChat}
          title="Joyce"
          className="fixed z-50 flex items-center justify-center rounded-full shadow-2xl text-white select-none cursor-grab active:cursor-grabbing transition-transform hover:scale-110"
          style={{ left: pos.x - R, top: pos.y - R, width: R * 2, height: R * 2, backgroundColor: accent }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
            <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.07L2 22l4.93-1.37A9.94 9.94 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm-1 14H9v-2h2v2zm0-4H9V8h2v4zm4 4h-2v-2h2v2zm0-4h-2V8h2v4z"/>
          </svg>
        </button>
      )}

      {/* ── Chat / Expanded window ── */}
      {mode !== 'bubble' && (
        <div
          className="fixed z-50 flex flex-col rounded-2xl shadow-2xl overflow-hidden"
          style={{ left: px, top: py, width: w, height: h, background: '#0f172a', color: '#f1f5f9' }}
        >
          {/* Header */}
          <div
            onMouseDown={startDrag}
            className="flex items-center gap-2.5 px-4 py-3 select-none cursor-grab active:cursor-grabbing shrink-0"
            style={{ backgroundColor: accent }}
          >
            <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5 shrink-0">
              <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.07L2 22l4.93-1.37A9.94 9.94 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm-1 14H9v-2h2v2zm0-4H9V8h2v4zm4 4h-2v-2h2v2zm0-4h-2V8h2v4z"/>
            </svg>
            <p className="text-sm font-semibold text-white flex-1 leading-none">Joyce</p>
            <div className="flex items-center gap-0.5">
              {mode === 'expanded'
                ? <button onClick={() => setMode('chat')}    title="Shrink"    className="w-7 h-7 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors text-sm">⊡</button>
                : <button onClick={() => setMode('expanded')} title="Expand"   className="w-7 h-7 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors text-sm">⊞</button>
              }
              <button onClick={() => setMode('bubble')}      title="Minimize"  className="w-7 h-7 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors text-base leading-none">—</button>
              <button onClick={() => { setMode('bubble'); setMsgs([]) }} title="Close" className="w-7 h-7 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors text-sm">✕</button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {msgs.map((m, i) => {
              // Find the user message that triggered this assistant reply (for "submit feedback" text)
              const triggerUserMsg = m.role === 'assistant' && m.is_feedback
                ? msgs.slice(0, i).filter(x => x.role === 'user').slice(-1)[0]
                : null

              return (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {m.role === 'assistant' && (
                    <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mr-2 mt-0.5" style={{ backgroundColor: accent }}>
                      <svg viewBox="0 0 24 24" fill="white" className="w-3.5 h-3.5"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.07L2 22l4.93-1.37A9.94 9.94 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2z"/></svg>
                    </div>
                  )}
                  <div className="flex flex-col gap-1 max-w-[82%]">
                    {/* Image attachment */}
                    {m.image && (
                      <img src={m.image} alt="Attachment" className={`rounded-xl object-cover max-h-48 w-full ${m.role === 'user' ? 'rounded-br-sm' : 'rounded-bl-sm'}`} />
                    )}
                    {/* Text bubble */}
                    {m.content && (
                      <div
                        className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                          m.role === 'user' ? 'rounded-br-sm text-white' : 'rounded-bl-sm bg-slate-800 text-slate-100'
                        }`}
                        style={m.role === 'user' ? { backgroundColor: accent } : {}}
                      >
                        {m.content}
                      </div>
                    )}
                    {/* Feedback submit button — shown when AI detects feedback */}
                    {m.is_feedback && triggerUserMsg && (
                      submittedFbIdxs.has(i) ? (
                        <div className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-2.5 py-1.5">
                          ✓ Feedback submitted — thank you!
                        </div>
                      ) : (
                        <button
                          onClick={() => submitChatFeedback(i, triggerUserMsg.content)}
                          disabled={submitingFbIdx === i}
                          className="text-xs font-semibold text-white rounded-lg px-2.5 py-1.5 text-left transition-opacity hover:opacity-90 disabled:opacity-50"
                          style={{ background: `linear-gradient(135deg,${accent},#22c55e)` }}
                        >
                          {submitingFbIdx === i ? 'Submitting…' : 'Submit as formal feedback'}
                        </button>
                      )
                    )}
                    {/* Action result badges */}
                    {m.action_result?.type === 'menu_item_added' && (
                      <div className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-2.5 py-1.5">
                        ✓ Menu item added
                      </div>
                    )}
                    {m.action_result?.type === 'menu_item_toggled' && (
                      <div className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg px-2.5 py-1.5">
                        ✓ Menu item updated
                      </div>
                    )}
                    {m.action_result?.type === 'social_post' && (
                      <div className="text-xs text-purple-400 bg-purple-500/10 border border-purple-500/20 rounded-lg px-2.5 py-1.5">
                        {Object.entries((m.action_result.results as Record<string, {status: string}>) ?? {})
                          .filter(([, v]) => v.status === 'published')
                          .length > 0
                          ? `✓ Posted to ${Object.entries((m.action_result.results as Record<string, {status: string}>) ?? {}).filter(([, v]) => v.status === 'published').map(([p]) => p).join(', ')}`
                          : '✗ Post failed — check platform connection'}
                      </div>
                    )}
                    {m.action_result?.type === 'ad_campaign' && (
                      <div className="text-xs text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded-lg px-2.5 py-1.5">
                        ✓ Campaign launched on {String(m.action_result.platform)}
                      </div>
                    )}
                    {m.action_result?.type === 'accounting_entry' && (
                      <div className="text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-2.5 py-1.5">
                        ✓ {String(m.action_result.entry_type)} recorded — ${Number(m.action_result.amount).toFixed(2)}
                      </div>
                    )}
                    {m.action_result?.type === 'order_updated' && (
                      <div className="text-xs text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 rounded-lg px-2.5 py-1.5">
                        ✓ Order #{String(m.action_result.order_id)} → {String(m.action_result.status)}
                      </div>
                    )}
                    {m.action_result?.type === 'scheduled_task' && (
                      <div className="text-xs text-sky-400 bg-sky-500/10 border border-sky-500/20 rounded-lg px-2.5 py-1.5 space-y-0.5">
                        <div className="font-semibold">Automation scheduled</div>
                        <div className="text-sky-300/80">{String(m.action_result.label)}</div>
                        {m.action_result.cron_expression && (
                          <div className="font-mono text-sky-300/60">{String(m.action_result.cron_expression)}</div>
                        )}
                        {m.action_result.next_run_at && (
                          <div className="text-sky-300/60">
                            Next: {new Date(String(m.action_result.next_run_at)).toLocaleString(undefined, { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })}
                          </div>
                        )}
                      </div>
                    )}
                    {m.action_result?.type === 'platforms' && (
                      <div className="text-xs text-slate-400 bg-slate-700/40 border border-slate-600/30 rounded-lg px-2.5 py-1.5">
                        Connected: {(m.action_result.platforms as string[]).join(', ') || 'none'}
                      </div>
                    )}
                    {/* Navigate badge */}
                    {m.navigate && (
                      <div className="text-xs text-slate-400 bg-slate-800/60 rounded-lg px-2.5 py-1.5">
                        Navigating to {m.navigate}…
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Working indicator */}
            {loading && (
              <div className="flex justify-start items-end gap-2">
                <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center" style={{ backgroundColor: accent }}>
                  <svg viewBox="0 0 24 24" fill="white" className="w-3.5 h-3.5"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.07L2 22l4.93-1.37A9.94 9.94 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2z"/></svg>
                </div>
                <div className="bg-slate-800 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
                  <div className="flex gap-1">
                    {[0,150,300].map(d => (
                      <span key={d} className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay:`${d}ms` }}/>
                    ))}
                  </div>
                  <span className="text-xs text-slate-500 animate-pulse">Working on it…</span>
                </div>
              </div>
            )}

            {/* Suggestion chips */}
            {msgs.length === 1 && !loading && (
              <div className="flex flex-wrap gap-2 mt-2">
                {SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => send(s)} className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-full border border-slate-700 transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Attachment preview */}
          {attachment && (
            <div className="px-3 pb-2 flex items-center gap-2 border-t border-slate-800 pt-2">
              {attachment.isImage
                ? <img src={attachment.data} alt="" className="h-12 w-12 rounded-lg object-cover border border-slate-700 shrink-0" />
                : <div className="h-12 w-12 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0"><svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg></div>
              }
              <span className="text-xs text-slate-400 truncate flex-1">{attachment.name}</span>
              <button onClick={() => setAttachment(null)} className="text-slate-500 hover:text-red-400 text-sm shrink-0 transition-colors">✕</button>
            </div>
          )}

          {/* Input bar */}
          <div className="px-3 pb-3 pt-2 border-t border-slate-800 shrink-0">
            <div className="flex gap-2 items-center">
              {/* Attach button */}
              <button
                onClick={() => fileRef.current?.click()}
                title="Attach file or image"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors shrink-0"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/>
                </svg>
              </button>
              <input ref={fileRef} type="file" accept="image/*,.pdf,.txt,.csv,.json" className="hidden" onChange={handleFileChange} />

              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                onPaste={handlePaste}
                placeholder={attachment ? "Add a message… (or just send)" : "Ask anything or give a command…"}
                disabled={loading}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-slate-500 transition-colors disabled:opacity-60"
              />
              <button
                onClick={() => send()}
                disabled={(!input.trim() && !attachment) || loading}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-white disabled:opacity-30 shrink-0 transition-opacity hover:opacity-90"
                style={{ backgroundColor: accent }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 rotate-90"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
              </button>
            </div>
            <p className="text-xs text-slate-600 mt-1.5 text-center">Share feedback · post to social · launch ads · manage menu</p>
          </div>
        </div>
      )}

      {/* Faint anchor bubble when chat is open */}
      {mode !== 'bubble' && (
        <div
          onMouseDown={startDrag}
          className="fixed z-40 flex items-center justify-center rounded-full cursor-grab active:cursor-grabbing select-none"
          style={{ left: pos.x - R, top: pos.y - R, width: R * 2, height: R * 2, backgroundColor: accent, opacity: 0.35 }}
          title="Drag to reposition"
        />
      )}
    </>
  )
}
