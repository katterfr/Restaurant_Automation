'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api-production-731b.up.railway.app'

const INITIAL_GREETING =
  "Hi! I'm Joanna, a live AI demo from Careful Server. Tell me what you'd like to order and I'll walk you through the full experience."

type Message = { role: 'user' | 'assistant'; content: string }
type Phase = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error'

const STYLE = `
@keyframes cs-ring { 0%{transform:scale(1);opacity:.6} 100%{transform:scale(1.75);opacity:0} }
.cs-ring { animation: cs-ring 1.4s ease-out infinite; }
@keyframes cs-bar  { 0%,100%{transform:scaleY(.35)} 50%{transform:scaleY(1)} }
.cs-bar  { animation: cs-bar .75s ease-in-out infinite; }
`

export default function VoiceDemo() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: INITIAL_GREETING },
  ])
  const [phase, setPhase] = useState<Phase>('idle')
  const [errMsg, setErrMsg] = useState('')
  const [textInput, setTextInput] = useState('')
  const [speechOK, setSpeechOK] = useState<boolean | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const recRef   = useRef<SpeechRecognition | null>(null)
  const phaseRef = useRef<Phase>('idle')
  const msgRef   = useRef<Message[]>(messages)

  // keep refs in sync
  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { msgRef.current = messages }, [messages])

  // speech API detection (client-only)
  useEffect(() => {
    setSpeechOK(
      !!(window.SpeechRecognition ||
        (window as unknown as Record<string, unknown>).webkitSpeechRecognition)
    )
  }, [])

  // auto-scroll
  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, phase])

  const go = useCallback((p: Phase) => { phaseRef.current = p; setPhase(p) }, [])

  // ── TTS ────────────────────────────────────────────────────────────────────
  const speak = useCallback((text: string, onDone: () => void) => {
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = 'en-US'
    utter.rate = 1.05
    // pick an English voice; browsers vary
    const v = window.speechSynthesis.getVoices()
    const pick =
      v.find(x => x.lang.startsWith('en') && /samantha|zira|aria|google us/i.test(x.name)) ??
      v.find(x => x.lang.startsWith('en'))
    if (pick) utter.voice = pick
    utter.onend   = onDone
    utter.onerror = onDone
    go('speaking')
    window.speechSynthesis.speak(utter)
  }, [go])

  // ── API call ───────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (userText: string) => {
    const history = [...msgRef.current, { role: 'user' as const, content: userText }]
    setMessages(history)
    go('thinking')

    try {
      const res = await fetch(`${API_URL}/demo/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      const { reply } = await res.json() as { reply: string }
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        speak(reply, () => go('idle'))
      } else {
        go('idle')
      }
    } catch {
      setErrMsg('Something went wrong — please try again.')
      go('error')
    }
  }, [go, speak])

  // ── Speech recognition ─────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    const Ctor =
      window.SpeechRecognition ||
      (window as unknown as Record<string, new () => SpeechRecognition>).webkitSpeechRecognition
    if (!Ctor) return

    window.speechSynthesis?.cancel()
    go('listening')

    const rec = new Ctor()
    rec.lang = 'en-US'
    rec.interimResults = false
    rec.maxAlternatives = 1
    rec.continuous = false

    rec.onresult = (e: SpeechRecognitionEvent) => {
      const text = e.results[0][0].transcript.trim()
      if (text) sendMessage(text)
      else go('idle')
    }
    rec.onerror = () => go('idle')
    rec.onend   = () => { if (phaseRef.current === 'listening') go('idle') }

    recRef.current = rec
    rec.start()
  }, [go, sendMessage])

  // ── Button click ───────────────────────────────────────────────────────────
  const handleMic = useCallback(() => {
    if (phase === 'speaking')  { window.speechSynthesis.cancel(); go('idle'); return }
    if (phase === 'listening') { recRef.current?.stop(); go('idle'); return }
    if (phase === 'thinking')  return
    if (phase === 'error')     { go('idle'); return }
    startListening()
  }, [phase, go, startListening])

  const handleText = (e: React.FormEvent) => {
    e.preventDefault()
    const t = textInput.trim()
    if (!t || phase === 'thinking' || phase === 'speaking') return
    setTextInput('')
    sendMessage(t)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────
  const label: Record<Phase, string> = {
    idle:      speechOK ? 'Click to speak' : 'Type your order below',
    listening: 'Listening…',
    thinking:  'Thinking…',
    speaking:  'Speaking — click to interrupt',
    error:     errMsg || 'Error — click to retry',
  }

  const active   = phase === 'listening'
  const busy     = phase === 'thinking'
  const speaking = phase === 'speaking'

  return (
    <>
      <style>{STYLE}</style>
      <div
        className="rounded-xl p-4 space-y-3"
        style={{ background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.25)' }}
      >
        {/* Header */}
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <p className="text-white text-sm font-semibold">Try the AI Agent — Live</p>
        </div>

        {/* Transcript */}
        <div ref={scrollRef} className="space-y-2 max-h-44 overflow-y-auto pr-1">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-xs leading-relaxed ${
                  m.role === 'user' ? 'text-white' : 'bg-slate-700/80 text-slate-200'
                }`}
                style={m.role === 'user' ? { background: 'linear-gradient(135deg,#16a34a,#22c55e)' } : {}}
              >
                <p className="text-[10px] opacity-50 mb-0.5">
                  {m.role === 'user' ? 'You' : 'Joanna · AI Agent'}
                </p>
                {m.content}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {busy && (
            <div className="flex justify-start">
              <div className="bg-slate-700/80 rounded-2xl px-4 py-2 flex gap-1 items-center">
                {[0, 0.18, 0.36].map(d => (
                  <span
                    key={d}
                    className="w-1.5 h-1.5 rounded-full bg-green-400 animate-bounce"
                    style={{ animationDelay: `${d}s` }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Mic button */}
        <div className="flex flex-col items-center gap-2 pt-1">
          <div className="relative">
            {active && (
              <span
                className="cs-ring absolute inset-0 rounded-full pointer-events-none"
                style={{ background: 'rgba(22,163,74,0.3)' }}
              />
            )}
            <button
              onClick={handleMic}
              disabled={busy}
              aria-label={label[phase]}
              className="relative w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 disabled:cursor-not-allowed"
              style={{
                background: active
                  ? '#16a34a'
                  : speaking
                    ? 'rgba(22,163,74,0.25)'
                    : 'rgba(22,163,74,0.12)',
                border: `2px solid ${active || speaking ? '#16a34a' : 'rgba(22,163,74,0.35)'}`,
                opacity: busy ? 0.4 : 1,
              }}
            >
              {active ? (
                <span className="flex items-center gap-0.5 h-5">
                  {[1, 2.5, 3.5, 2.5, 1].map((h, i) => (
                    <span
                      key={i}
                      className="cs-bar w-0.5 rounded-full bg-white"
                      style={{ height: `${h * 5}px`, animationDelay: `${i * 0.1}s` }}
                    />
                  ))}
                </span>
              ) : speaking ? (
                <svg className="w-6 h-6 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                </svg>
              ) : (
                <svg className="w-6 h-6 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
                  <path d="M19 10v2a7 7 0 01-14 0v-2H3v2a9 9 0 008 8.94V23h2v-2.06A9 9 0 0021 12v-2h-2z"/>
                </svg>
              )}
            </button>
          </div>
          <p className={`text-xs ${phase === 'error' ? 'text-red-400' : 'text-slate-400'}`}>
            {label[phase]}
          </p>
        </div>

        {/* Text fallback for browsers without SpeechRecognition (Firefox) */}
        {speechOK === false && (
          <form onSubmit={handleText} className="flex gap-2">
            <input
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              placeholder="Type your order…"
              disabled={busy || speaking}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-green-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!textInput.trim() || busy || speaking}
              className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 disabled:opacity-40 transition-colors"
            >
              Send
            </button>
          </form>
        )}

        {/* Phone fallback */}
        <p className="text-center text-[11px] text-slate-500">
          Prefer a real call?{' '}
          <a href="tel:+17624417505" className="text-green-400 hover:text-green-300 transition-colors">
            +1 (762) 441-7505
          </a>
        </p>
      </div>
    </>
  )
}
