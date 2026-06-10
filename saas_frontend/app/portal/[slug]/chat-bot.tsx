'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'

type Msg  = { role: 'user' | 'assistant'; content: string }
type Mode = 'bubble' | 'chat' | 'expanded'

const R       = 28   // bubble radius (px)
const CHAT_W  = 380
const CHAT_H  = 520
const EXP_W   = 660
const EXP_H   = 640

const SUGGESTIONS = [
  "How are my sales today?",
  "How do I add a menu item?",
  "What features do I have?",
  "How do I create an ad campaign?",
]

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }

export default function ChatBot({ accent }: { accent: string }) {
  const [mode,    setMode]    = useState<Mode>('bubble')
  const [pos,     setPos]     = useState({ x: -1, y: -1 })
  const [msgs,    setMsgs]    = useState<Msg[]>([])
  const [input,   setInput]   = useState('')
  const [loading, setLoading] = useState(false)

  const dragging   = useRef(false)
  const origin     = useRef({ mx: 0, my: 0, px: 0, py: 0 })
  const moved      = useRef(false)
  const bottomRef  = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLInputElement>(null)

  // ── init position ──────────────────────────────────────────────────────────
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

  useEffect(() => {
    if (pos.x > 0) localStorage.setItem('portal_chat_pos', JSON.stringify(pos))
  }, [pos])

  // ── auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'bubble') bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, mode])

  // ── focus input on open ───────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'bubble') setTimeout(() => inputRef.current?.focus(), 120)
  }, [mode])

  // ── drag ──────────────────────────────────────────────────────────────────
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
    document.addEventListener('mouseup',   onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
    }
  }, [])

  const startDrag = useCallback((e: React.MouseEvent) => {
    dragging.current = true
    moved.current = false
    origin.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y }
    e.preventDefault()
  }, [pos])

  // ── open chat ─────────────────────────────────────────────────────────────
  function openChat() {
    if (moved.current) return
    setMode('chat')
    if (msgs.length === 0) {
      setMsgs([{
        role: 'assistant',
        content: "Hi! I'm your AI assistant. I can help you navigate your portal, understand your business stats, or explain how any feature works. What would you like to know?",
      }])
    }
  }

  // ── send message ─────────────────────────────────────────────────────────
  async function send(text?: string) {
    const content = (text ?? input).trim()
    if (!content || loading) return
    const next: Msg[] = [...msgs, { role: 'user', content }]
    setMsgs(next)
    setInput('')
    setLoading(true)
    try {
      const { reply } = await api.portal.chat(next)
      setMsgs(prev => [...prev, { role: 'assistant', content: reply }])
    } catch {
      setMsgs(prev => [...prev, { role: 'assistant', content: "Sorry, I ran into an error. Please try again." }])
    } finally {
      setLoading(false)
    }
  }

  if (pos.x < 0) return null

  // ── panel geometry ────────────────────────────────────────────────────────
  const w  = mode === 'expanded' ? EXP_W : CHAT_W
  const h  = mode === 'expanded' ? EXP_H : CHAT_H
  // Anchor bottom-right of panel near bubble, clamped to viewport
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
          title="AI Assistant"
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
          {/* Header — drag handle */}
          <div
            onMouseDown={startDrag}
            className="flex items-center gap-2.5 px-4 py-3 select-none cursor-grab active:cursor-grabbing shrink-0"
            style={{ backgroundColor: accent }}
          >
            <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5 shrink-0">
              <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.07L2 22l4.93-1.37A9.94 9.94 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm-1 14H9v-2h2v2zm0-4H9V8h2v4zm4 4h-2v-2h2v2zm0-4h-2V8h2v4z"/>
            </svg>
            <p className="text-sm font-semibold text-white flex-1 leading-none">AI Assistant</p>
            <div className="flex items-center gap-0.5">
              {/* Expand / shrink */}
              {mode === 'expanded' ? (
                <button
                  onClick={() => setMode('chat')}
                  title="Shrink"
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors text-sm"
                >⊡</button>
              ) : (
                <button
                  onClick={() => setMode('expanded')}
                  title="Expand"
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors text-sm"
                >⊞</button>
              )}
              {/* Minimize to bubble */}
              <button
                onClick={() => setMode('bubble')}
                title="Minimize"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors text-base leading-none"
              >—</button>
              {/* Close (clears history) */}
              <button
                onClick={() => { setMode('bubble'); setMsgs([]) }}
                title="Close"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors text-sm"
              >✕</button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mr-2 mt-0.5" style={{ backgroundColor: accent }}>
                    <svg viewBox="0 0 24 24" fill="white" className="w-3.5 h-3.5">
                      <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.07L2 22l4.93-1.37A9.94 9.94 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2z"/>
                    </svg>
                  </div>
                )}
                <div
                  className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'rounded-br-sm text-white'
                      : 'rounded-bl-sm bg-slate-800 text-slate-100'
                  }`}
                  style={m.role === 'user' ? { backgroundColor: accent } : {}}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div className="flex justify-start items-end gap-2">
                <div className="w-6 h-6 rounded-full shrink-0" style={{ backgroundColor: accent }} />
                <div className="bg-slate-800 rounded-2xl rounded-bl-sm px-4 py-3">
                  <div className="flex gap-1">
                    {[0, 150, 300].map(d => (
                      <span
                        key={d}
                        className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"
                        style={{ animationDelay: `${d}ms` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Suggestion chips (only on first message) */}
            {msgs.length === 1 && !loading && (
              <div className="flex flex-wrap gap-2 mt-2">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-full border border-slate-700 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <div className="px-3 pb-3 pt-2 border-t border-slate-800 shrink-0">
            <div className="flex gap-2 items-center">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder="Ask anything about your portal…"
                disabled={loading}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-slate-500 transition-colors disabled:opacity-60"
              />
              <button
                onClick={() => send()}
                disabled={!input.trim() || loading}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-white disabled:opacity-30 shrink-0 transition-opacity hover:opacity-90"
                style={{ backgroundColor: accent }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 rotate-90">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
              </button>
            </div>
            <p className="text-xs text-slate-600 mt-1.5 text-center">Powered by Claude AI</p>
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
