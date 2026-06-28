'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

type Attachment = { data: string; name: string; isImage: boolean }
type Msg = {
  id: string
  role: 'user' | 'assistant'
  content: string
  image?: string
  navigate?: string | null
  action_result?: Record<string, unknown> | null
  ts: Date
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[\s\S]+?\*\*|\*[^*]+?\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>
    if (part.startsWith('*') && part.endsWith('*') && !part.startsWith('**'))
      return <em key={i} className="italic">{part.slice(1, -1)}</em>
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={i} className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs font-mono text-blue-300">{part.slice(1, -1)}</code>
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (link) return <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300">{link[1]}</a>
    return part
  })
}

function Markdown({ text }: { text: string }) {
  const segs = text.split(/(```[\s\S]*?```)/g)
  const nodes: React.ReactNode[] = []

  segs.forEach((seg, si) => {
    if (seg.startsWith('```')) {
      const m = seg.match(/^```(\w*)\n?([\s\S]*?)```$/)
      const lang = m?.[1] || ''
      const code = m?.[2] ?? seg.slice(3).replace(/```$/, '')
      nodes.push(
        <div key={`cb-${si}`} className="my-3 rounded-xl overflow-hidden border border-slate-700">
          {lang && <div className="bg-slate-800 px-3 py-1.5 text-xs text-slate-400 font-mono border-b border-slate-700">{lang}</div>}
          <pre className="bg-slate-950 p-4 overflow-x-auto text-xs leading-relaxed">
            <code className="text-emerald-300 font-mono whitespace-pre">{code}</code>
          </pre>
        </div>
      )
      return
    }

    const lines = seg.split('\n')
    let i = 0
    while (i < lines.length) {
      const line = lines[i]
      if (!line.trim()) { i++; continue }

      // Heading
      const hm = line.match(/^(#{1,3})\s+(.+)/)
      if (hm) {
        const lvl = hm[1].length
        const cls = lvl === 1
          ? 'text-lg font-bold mt-4 mb-1 text-white'
          : lvl === 2
          ? 'text-base font-semibold mt-3 mb-1 text-white'
          : 'text-sm font-semibold mt-2 mb-0.5 text-slate-200'
        nodes.push(<div key={`h-${si}-${i}`} className={cls}>{renderInline(hm[2])}</div>)
        i++; continue
      }

      // Table
      if (line.startsWith('|')) {
        const rows: string[] = []
        while (i < lines.length && lines[i].startsWith('|')) { rows.push(lines[i]); i++ }
        const data = rows.filter(r => !r.replace(/\|/g, '').trim().match(/^[-: ]+$/))
        nodes.push(
          <div key={`tbl-${si}-${i}`} className="my-3 overflow-x-auto rounded-xl border border-slate-700">
            <table className="w-full text-xs border-collapse">
              <tbody>
                {data.map((row, ri) => {
                  const cells = row.split('|').slice(1, -1).map(c => c.trim())
                  return (
                    <tr key={ri} className={ri === 0 ? 'bg-slate-900' : ri % 2 === 0 ? 'bg-slate-950' : 'bg-slate-900/40'}>
                      {cells.map((cell, ci) =>
                        ri === 0
                          ? <th key={ci} className="px-3 py-2 text-left text-slate-300 font-semibold border-b border-slate-700 whitespace-nowrap">{renderInline(cell)}</th>
                          : <td key={ci} className="px-3 py-2 text-slate-300 border-b border-slate-800">{renderInline(cell)}</td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
        continue
      }

      // List
      if (line.match(/^([-*]|\d+\.)\s/)) {
        const items: string[] = []
        const ordered = !!line.match(/^\d+\.\s/)
        while (i < lines.length && lines[i].match(/^([-*]|\d+\.)\s/)) {
          items.push(lines[i].replace(/^([-*]|\d+\.)\s/, ''))
          i++
        }
        nodes.push(
          <ul key={`list-${si}-${i}`} className={`${ordered ? 'list-decimal' : 'list-disc'} list-inside space-y-1 my-2 ml-1`}>
            {items.map((it, ii) => (
              <li key={ii} className="text-sm text-slate-300 leading-relaxed">{renderInline(it)}</li>
            ))}
          </ul>
        )
        continue
      }

      // HR
      if (line.match(/^---+$/)) {
        nodes.push(<hr key={`hr-${si}-${i}`} className="border-slate-700 my-4" />)
        i++; continue
      }

      // Paragraph
      const plines: string[] = []
      while (
        i < lines.length && lines[i].trim() &&
        !lines[i].match(/^#{1,3}\s/) && !lines[i].startsWith('|') &&
        !lines[i].match(/^([-*]|\d+\.)\s/) && !lines[i].match(/^---+$/) &&
        !lines[i].startsWith('```')
      ) { plines.push(lines[i]); i++ }
      if (plines.length) {
        nodes.push(
          <p key={`p-${si}-${i}`} className="text-sm text-slate-300 leading-relaxed my-1">
            {plines.flatMap((l, li) => li === 0
              ? renderInline(l)
              : [<br key={`br-${li}`} />, ...renderInline(l)]
            )}
          </p>
        )
      }
    }
  })

  return <div className="space-y-0.5">{nodes}</div>
}

// ── Action badge ──────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  tenant_created:        '✓ Tenant created',
  tenant_updated:        '✓ Tenant updated',
  tenant_deleted:        '⚠ Tenant deleted',
  feature_toggled:       '✓ Feature updated',
  features_synced:       '✓ Features synced',
  owner_created:         '✓ Owner account created',
  menu_item_added:       '✓ Menu item added',
  menu_item_updated:     '✓ Menu item updated',
  menu_item_deleted:     '✓ Menu item deleted',
  menu_item_toggled:     '✓ Menu item toggled',
  analytics:             '✓ Analytics retrieved',
  tenant_list:           '✓ Tenants listed',
  tenant_details:        '✓ Tenant details loaded',
  orders:                '✓ Orders loaded',
  ad_campaign:           '✓ Ad campaign launched',
  ad_campaigns_list:     '✓ Campaigns loaded',
  accounting_entry:      '✓ Accounting entry recorded',
  accounting_summary:    '✓ Accounting summary loaded',
  phone_agent_status:    '✓ Phone agent status loaded',
  phone_agent_updated:   '✓ Phone agent updated',
  suggestion_created:    '✓ Suggestion recorded',
  suggestions_list:      '✓ Suggestions loaded',
}

const DANGER = new Set(['tenant_deleted', 'menu_item_deleted'])

function ActionBadge({ r }: { r: Record<string, unknown> }) {
  const type = r.type as string

  // Rich badge for social post
  if (type === 'social_post') {
    const results = (r.results ?? {}) as Record<string, { status: string }>
    const ok = Object.entries(results).filter(([, v]) => v.status === 'published').map(([p]) => p)
    const failed = Object.entries(results).filter(([, v]) => v.status !== 'published').map(([p]) => p)
    return (
      <div className="text-xs text-purple-400 bg-purple-500/10 border border-purple-500/20 rounded-lg px-2.5 py-1.5 space-y-0.5">
        <div className="font-semibold">Social post published</div>
        {ok.length > 0 && <div>Posted: {ok.join(', ')}</div>}
        {failed.length > 0 && <div className="text-red-400">Failed: {failed.join(', ')}</div>}
      </div>
    )
  }

  // Rich badge for scheduled task
  if (type === 'scheduled_task') {
    return (
      <div className="text-xs text-sky-400 bg-sky-500/10 border border-sky-500/20 rounded-lg px-2.5 py-1.5 space-y-0.5">
        <div className="font-semibold">Automation scheduled</div>
        {Boolean(r.label) && <div>{String(r.label)}</div>}
        {Boolean(r.cron_expression) && <div className="font-mono text-sky-300">{String(r.cron_expression)}</div>}
        {Boolean(r.next_run_at) && <div>Next: {new Date(String(r.next_run_at)).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>}
      </div>
    )
  }

  // Rich badge for accounting entry
  if (type === 'accounting_entry') {
    return (
      <div className="text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-2.5 py-1.5 space-y-0.5">
        <div className="font-semibold">Accounting entry recorded</div>
        {Boolean(r.tenant_id) && <div>Tenant #{String(r.tenant_id)}</div>}
      </div>
    )
  }

  // Rich badge for phone agent update
  if (type === 'phone_agent_updated') {
    return (
      <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2.5 py-1.5">
        Phone agent updated{Boolean(r.tenant_id) ? ` — Tenant #${String(r.tenant_id)}` : ''}
      </div>
    )
  }

  const label = ACTION_LABELS[type] ?? '✓ Action completed'
  const danger = DANGER.has(type)
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 border font-medium ${
      danger ? 'text-red-400 bg-red-500/10 border-red-500/30' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
    }`}>
      {label}
    </span>
  )
}

// ── Bot avatar ────────────────────────────────────────────────────────────────

function BotAvatar({ size = 8 }: { size?: number }) {
  return (
    <div className={`w-${size} h-${size} rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shrink-0 shadow-lg shadow-blue-900/40`}>
      <svg viewBox="0 0 24 24" fill="white" className="w-4 h-4">
        <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.07L2 22l4.93-1.37A9.94 9.94 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2z"/>
      </svg>
    </div>
  )
}

// ── Suggestions ───────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  { label: 'Show platform analytics' },
  { label: 'List all tenants' },
  { label: 'Post to social media for a restaurant' },
  { label: 'View accounting for a tenant' },
  { label: 'Check phone agent status for a tenant' },
  { label: 'Schedule a recurring automation task' },
  { label: 'Launch an ad campaign for a restaurant' },
  { label: 'Activate phone agent for a tenant' },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminChatFullPage() {
  const router = useRouter()
  const [msgs,       setMsgs]       = useState<Msg[]>([])
  const [input,      setInput]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const bottomRef   = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef     = useRef<HTMLInputElement>(null)
  const msgsRef     = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  // Auto-grow textarea
  function resizeTextarea() {
    const el = textareaRef.current; if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }

  // Initial greeting
  useEffect(() => {
    setMsgs([{
      id: 'init',
      role: 'assistant',
      content: "Hi! I'm your admin AI with **full platform access**. I can:\n\n- **Tenant management** — create, update, delete, list restaurants, toggle features, sync plans\n- **Marketing** — publish social posts and launch ad campaigns for any restaurant\n- **Accounting** — view P&L, record income/expense entries for any tenant\n- **Phone Agent** — activate, deactivate, or update the AI phone agent for any restaurant\n- **Analytics** — platform MRR, orders, feedback, and growth trends\n- **Automations** — schedule any of the above to run automatically on a cron or one-time schedule\n\nDrop or paste **images** — I'll analyze food photos, read menus, extract receipts, and act on them.\n\nWhat do you need?",
      ts: new Date(),
    }])
  }, [])

  const readFile = useCallback((file: File) => {
    const isImage = file.type.startsWith('image/')
    const reader = new FileReader()
    if (isImage) {
      reader.onload = ev => setAttachment({ data: ev.target?.result as string, name: file.name, isImage: true })
      reader.readAsDataURL(file)
    } else {
      reader.onload = ev => setAttachment({ data: ev.target?.result as string, name: file.name, isImage: false })
      reader.readAsText(file)
    }
  }, [])

  // Global paste → image capture
  useEffect(() => {
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
  }, [readFile])

  // Drag & drop
  function onDragOver(e: React.DragEvent)  { e.preventDefault(); setIsDragging(true) }
  function onDragLeave(e: React.DragEvent) { e.preventDefault(); setIsDragging(false) }
  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDragging(false)
    const file = e.dataTransfer.files?.[0]; if (file) readFile(file)
  }

  const send = useCallback(async (text?: string) => {
    const content = (text ?? input).trim()
    if ((!content && !attachment) || loading) return

    const userMsg: Msg = {
      id: Date.now().toString(),
      role: 'user',
      content: attachment && !attachment.isImage
        ? `[File: ${attachment.name}]\n${attachment.data}\n\n${content}`.trim()
        : content,
      ...(attachment?.isImage ? { image: attachment.data } : {}),
      ts: new Date(),
    }

    const next = [...msgs, userMsg]
    setMsgs(next)
    setInput('')
    setAttachment(null)
    setLoading(true)
    if (textareaRef.current) { textareaRef.current.style.height = 'auto' }

    try {
      const { reply, navigate, action_result } = await api.adminChat.chat(
        next.map(m => ({ role: m.role, content: m.content, ...(m.image ? { image: m.image } : {}) }))
      )
      setMsgs(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: reply,
        navigate,
        action_result,
        ts: new Date(),
      }])
      if (navigate) setTimeout(() => router.push(navigate), 800)
    } catch {
      setMsgs(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I ran into an error. Please try again.',
        ts: new Date(),
      }])
    } finally {
      setLoading(false)
    }
  }, [input, attachment, loading, msgs, router])

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  function clearChat() {
    setMsgs([{
      id: Date.now().toString(),
      role: 'assistant',
      content: 'Chat cleared. What do you need?',
      ts: new Date(),
    }])
    setAttachment(null)
    setInput('')
  }

  return (
    <div
      className="flex flex-col bg-slate-950 text-slate-100 relative"
      style={{ height: '100vh' }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Drop overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 pointer-events-none"
          style={{ background: 'rgba(37,99,235,0.13)', backdropFilter: 'blur(2px)', border: '3px dashed rgba(96,165,250,0.6)' }}>
          <div className="w-20 h-20 rounded-2xl bg-blue-600/20 border-2 border-blue-400/40 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="#93c5fd" strokeWidth={1.5} className="w-10 h-10">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/>
            </svg>
          </div>
          <p className="text-blue-300 font-semibold text-xl tracking-tight">Drop image to attach</p>
          <p className="text-blue-400/60 text-sm">I&apos;ll analyze it and act on your command</p>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center gap-3 px-6 py-4 border-b border-slate-800 shrink-0"
        style={{ background: 'linear-gradient(to right, #0f172a, #111827)' }}>
        <BotAvatar size={10} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white text-base leading-none">Admin AI Assistant</p>
          <p className="text-slate-500 text-xs mt-0.5">Full platform access · tool-enabled · image-aware</p>
        </div>
        <button
          onClick={clearChat}
          className="text-xs text-slate-500 hover:text-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-800 border border-slate-800 hover:border-slate-700 transition-all"
        >
          Clear chat
        </button>
      </header>

      {/* Messages */}
      <div ref={msgsRef} className="flex-1 overflow-y-auto px-6 py-8" style={{ scrollbarGutter: 'stable' }}>
        <div className="max-w-3xl mx-auto space-y-8">
          {msgs.map(m => (
            <div key={m.id} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              {/* Avatar */}
              {m.role === 'assistant'
                ? <BotAvatar size={8} />
                : (
                  <div className="w-8 h-8 rounded-xl bg-slate-700 flex items-center justify-center shrink-0 text-xs font-bold text-slate-300">
                    A
                  </div>
                )
              }

              {/* Content */}
              <div className={`flex flex-col gap-2 min-w-0 ${m.role === 'user' ? 'items-end max-w-[72%]' : 'items-start max-w-[85%]'}`}>
                {m.image && (
                  <div className="rounded-2xl overflow-hidden border border-slate-700 max-w-sm">
                    <img src={m.image} alt="Attached image" className="max-h-64 w-full object-contain bg-slate-900" />
                  </div>
                )}
                {m.content && (
                  <div className={`rounded-2xl px-4 py-3 ${
                    m.role === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-sm'
                      : 'bg-slate-800/80 border border-slate-700/50 rounded-tl-sm'
                  }`}>
                    {m.role === 'assistant'
                      ? <Markdown text={m.content} />
                      : <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
                    }
                  </div>
                )}
                {!!m.action_result?.type && <ActionBadge r={m.action_result} />}
                {m.navigate && (
                  <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800/60 rounded-lg px-3 py-2 border border-slate-700">
                    <span className="text-blue-400">↗</span>
                    Navigating to <code className="text-blue-400 font-mono">{m.navigate}</code>…
                  </div>
                )}
                <span className="text-[11px] text-slate-600 px-1">
                  {m.ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div className="flex gap-3">
              <BotAvatar size={8} />
              <div className="bg-slate-800/80 border border-slate-700/50 rounded-2xl rounded-tl-sm px-4 py-3.5 flex items-center gap-1.5">
                {[0, 120, 240].map(d => (
                  <span key={d} className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
            </div>
          )}

          {/* Suggestion chips — shown only on initial greeting */}
          {msgs.length === 1 && !loading && (
            <div>
              <p className="text-xs text-slate-500 mb-3 font-medium uppercase tracking-wider">Quick commands</p>
              <div className="grid grid-cols-2 gap-2">
                {SUGGESTIONS.slice(0, 8).map(s => (
                  <button
                    key={s.label}
                    onClick={() => send(s.label)}
                    className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm text-slate-300 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 hover:border-slate-600 transition-all text-left group"
                  >
                    <span className="group-hover:text-white transition-colors">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Attachment preview */}
      {attachment && (
        <div className="px-6 border-t border-slate-800 bg-slate-900">
          <div className="max-w-3xl mx-auto py-3 flex items-center gap-3">
            {attachment.isImage
              ? <img src={attachment.data} alt="" className="h-16 w-16 rounded-xl object-cover border border-slate-700 shrink-0" />
              : <div className="h-16 w-16 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0"><svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg></div>
            }
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-200 font-medium truncate">{attachment.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">{attachment.isImage ? 'Image attached — tell me what to do with it' : 'File attached'}</p>
            </div>
            <button onClick={() => setAttachment(null)} className="p-2 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors text-sm">✕</button>
          </div>
        </div>
      )}

      {/* Input bar */}
      <div className="shrink-0 border-t border-slate-800 bg-slate-900 px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex gap-3 items-end">
            <button
              onClick={() => fileRef.current?.click()}
              title="Attach file or image"
              className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 transition-all shrink-0"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/>
              </svg>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf,.txt,.csv,.json"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = '' }}
            />

            <textarea
              ref={textareaRef}
              value={input}
              rows={1}
              onChange={e => { setInput(e.target.value); resizeTextarea() }}
              onKeyDown={onKeyDown}
              placeholder={attachment ? 'Tell me what to do with this image…' : 'Ask anything, give a command, or paste/drop an image…'}
              disabled={loading}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-60 resize-none leading-relaxed"
              style={{ minHeight: '42px', maxHeight: '200px', overflowY: 'auto' }}
            />

            <button
              onClick={() => send()}
              disabled={(!input.trim() && !attachment) || loading}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed shrink-0 transition-colors shadow-lg shadow-blue-900/30"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 rotate-90">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          </div>

          <p className="text-center text-[11px] text-slate-600 mt-2.5">
            Enter to send · Shift+Enter for new line · paste or drag images anywhere on this page
          </p>
        </div>
      </div>
    </div>
  )
}
