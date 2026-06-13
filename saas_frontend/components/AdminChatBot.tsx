'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

type Attachment = { data: string; name: string; isImage: boolean }
type Msg = {
  role: 'user' | 'assistant'
  content: string
  image?: string
  navigate?: string | null
  action_result?: Record<string, unknown> | null
}

const ACCEPT = 'image/*,.pdf,.txt,.csv,.json'

const SUGGESTIONS = [
  'Show me all tenants',
  'What is the platform MRR?',
  'Create a new restaurant',
  'Show me recent activity',
]

const ACTION_LABELS: Record<string, string> = {
  tenant_created:    '✓ Tenant created',
  tenant_updated:    '✓ Tenant updated',
  tenant_deleted:    '⚠ Tenant deleted',
  feature_toggled:   '✓ Feature updated',
  features_synced:   '✓ Features synced',
  owner_created:     '✓ Owner account created',
  menu_item_added:   '✓ Menu item added',
  menu_item_updated: '✓ Menu item updated',
  menu_item_deleted: '✓ Menu item deleted',
  menu_item_toggled: '✓ Menu item toggled',
}
const ACTION_COLOR: Record<string, string> = {
  tenant_deleted: 'text-red-400 bg-red-500/10 border-red-500/20',
}
const DEFAULT_ACTION_COLOR = 'text-green-400 bg-green-500/10 border-green-500/20'

export default function AdminChatBot() {
  const router = useRouter()

  const [open,       setOpen]       = useState(false)
  const [expanded,   setExpanded]   = useState(false)
  const [msgs,       setMsgs]       = useState<Msg[]>([])
  const [input,      setInput]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)
  const fileRef   = useRef<HTMLInputElement>(null)

  useEffect(() => { if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, open])
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 100) }, [open])

  function openChat() {
    setOpen(true)
    if (msgs.length === 0) {
      setMsgs([{ role: 'assistant', content: "Hi! I'm your admin AI. I can manage tenants, toggle features, view analytics, create accounts, and automate any platform task. What do you need?" }])
    }
  }

  const readFile = useCallback((file: File) => {
    const isImage = file.type.startsWith('image/')
    const reader  = new FileReader()
    if (isImage) {
      reader.onload = ev => setAttachment({ data: ev.target?.result as string, name: file.name, isImage: true })
      reader.readAsDataURL(file)
    } else {
      reader.onload = ev => setAttachment({ data: ev.target?.result as string, name: file.name, isImage: false })
      reader.readAsText(file)
    }
  }, [])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (file) readFile(file); e.target.value = ''
  }

  // Paste anywhere in the window when chat is open
  useEffect(() => {
    if (!open) return
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items; if (!items) return
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile(); if (file) { readFile(file); e.preventDefault() }; return
        }
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [open, readFile])

  function handleInputPaste(e: React.ClipboardEvent) {
    // Already handled at document level; this catches it if focus is in input
    const items = e.clipboardData?.items; if (!items) return
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile(); if (file) { readFile(file); e.preventDefault() }; return
      }
    }
  }

  function handleDragOver(e: React.DragEvent) { e.preventDefault(); setIsDragging(true) }
  function handleDragLeave(e: React.DragEvent) { e.preventDefault(); setIsDragging(false) }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDragging(false)
    const file = e.dataTransfer.files?.[0]; if (file) readFile(file)
  }

  const send = useCallback(async (text?: string) => {
    const content = (text ?? input).trim()
    if ((!content && !attachment) || loading) return

    const userMsg: Msg = {
      role: 'user', content,
      ...(attachment?.isImage ? { image: attachment.data } : {}),
    }
    if (attachment && !attachment.isImage) {
      userMsg.content = `[File: ${attachment.name}]\n${attachment.data}\n\n${content}`.trim()
    }

    const next = [...msgs, userMsg]
    setMsgs(next); setInput(''); setAttachment(null); setLoading(true)

    try {
      const { reply, navigate, action_result } = await api.adminChat.chat(
        next.map(m => ({ role: m.role, content: m.content, ...(m.image ? { image: m.image } : {}) }))
      )
      setMsgs(prev => [...prev, { role: 'assistant', content: reply, navigate, action_result }])
      if (navigate) setTimeout(() => router.push(navigate), 600)
    } catch {
      setMsgs(prev => [...prev, { role: 'assistant', content: 'Sorry, I ran into an error. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }, [input, attachment, loading, msgs, router])

  const w = expanded ? 700 : 400
  const h = expanded ? 680 : 560

  return (
    <>
      {/* Floating bubble */}
      {!open && (
        <button
          onClick={openChat}
          title="Admin AI Assistant"
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center text-white transition-transform hover:scale-110 bg-blue-600"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
            <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.07L2 22l4.93-1.37A9.94 9.94 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm-1 14H9v-2h2v2zm0-4H9V8h2v4zm4 4h-2v-2h2v2zm0-4h-2V8h2v4z"/>
          </svg>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-6 right-6 z-50 flex flex-col rounded-2xl shadow-2xl overflow-hidden"
          style={{ width: w, height: h, background: '#0f172a', color: '#f1f5f9' }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Drop overlay */}
          {isDragging && (
            <div className="absolute inset-0 z-20 rounded-2xl flex flex-col items-center justify-center gap-3 pointer-events-none"
              style={{ background: 'rgba(37,99,235,0.18)', border: '2.5px dashed #3b82f6' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#93c5fd" strokeWidth={1.5} className="w-12 h-12">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/>
              </svg>
              <p className="text-blue-300 font-semibold text-base">Drop image to attach</p>
            </div>
          )}
          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 py-3 shrink-0 bg-blue-600">
            <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5 shrink-0">
              <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.07L2 22l4.93-1.37A9.94 9.94 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm-1 14H9v-2h2v2zm0-4H9V8h2v4zm4 4h-2v-2h2v2zm0-4h-2V8h2v4z"/>
            </svg>
            <div className="flex-1">
              <p className="text-sm font-semibold text-white leading-none">Admin AI Assistant</p>
              <p className="text-white/60 text-xs mt-0.5">Full platform access</p>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setExpanded(e => !e)}
                title={expanded ? 'Shrink' : 'Expand'}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors text-sm"
              >
                {expanded ? '⊡' : '⊞'}
              </button>
              <button
                onClick={() => { setOpen(false); setExpanded(false) }}
                title="Close"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center shrink-0 mr-2 mt-0.5">
                    <svg viewBox="0 0 24 24" fill="white" className="w-3.5 h-3.5"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.07L2 22l4.93-1.37A9.94 9.94 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2z"/></svg>
                  </div>
                )}
                <div className="flex flex-col gap-1 max-w-[82%]">
                  {m.image && (
                    <img src={m.image} alt="Attachment" className="rounded-xl object-cover max-h-48 w-full" />
                  )}
                  {m.content && (
                    <div
                      className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                        m.role === 'user' ? 'rounded-br-sm text-white bg-blue-600' : 'rounded-bl-sm bg-slate-800 text-slate-100'
                      }`}
                    >
                      {m.content}
                    </div>
                  )}
                  {m.action_result?.type && (
                    <div className={`text-xs rounded-lg px-2.5 py-1.5 border ${ACTION_COLOR[m.action_result.type as string] ?? DEFAULT_ACTION_COLOR}`}>
                      {ACTION_LABELS[m.action_result.type as string] ?? '✓ Action completed'}
                    </div>
                  )}
                  {m.navigate && (
                    <div className="text-xs text-slate-400 bg-slate-800/60 rounded-lg px-2.5 py-1.5">
                      Navigating to {m.navigate}…
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start items-end gap-2">
                <div className="w-6 h-6 rounded-full bg-blue-600 shrink-0" />
                <div className="bg-slate-800 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1">
                  {[0,150,300].map(d => (
                    <span key={d} className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay:`${d}ms` }}/>
                  ))}
                </div>
              </div>
            )}

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
                : <div className="h-12 w-12 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 text-xs text-slate-400">📄</div>
              }
              <span className="text-xs text-slate-400 truncate flex-1">{attachment.name}</span>
              <button onClick={() => setAttachment(null)} className="text-slate-500 hover:text-red-400 text-sm shrink-0">✕</button>
            </div>
          )}

          {/* Input */}
          <div className="px-3 pb-3 pt-2 border-t border-slate-800 shrink-0">
            <div className="flex gap-2 items-center">
              <button
                onClick={() => fileRef.current?.click()}
                title="Attach file or image"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors shrink-0"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/>
                </svg>
              </button>
              <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={handleFileChange} />
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                onPaste={handleInputPaste}
                placeholder={attachment ? 'Add a message or just send the image…' : 'Command, question, or paste/drop an image…'}
                disabled={loading}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-60"
              />
              <button
                onClick={() => send()}
                disabled={(!input.trim() && !attachment) || loading}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-white bg-blue-600 disabled:opacity-30 shrink-0 hover:opacity-90 transition-opacity"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 rotate-90"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
              </button>
            </div>
            <p className="text-xs text-slate-600 mt-1.5 text-center">Full admin access · paste or drag & drop images · attach files</p>
          </div>
        </div>
      )}
    </>
  )
}
