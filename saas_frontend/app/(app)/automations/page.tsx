'use client'
import { useState, useEffect, useCallback } from 'react'
import { api, ScheduledTask, ScheduledTaskRun } from '@/lib/api'

const COMMON_SCHEDULES = [
  { label: 'Every day at 9am UTC',     cron: '0 9 * * *' },
  { label: 'Weekdays at 11am UTC',     cron: '0 11 * * 1-5' },
  { label: 'Every Monday at 9am UTC',  cron: '0 9 * * 1' },
  { label: 'Every hour',               cron: '0 * * * *' },
  { label: 'Every Sunday at midnight', cron: '0 0 * * 0' },
]

const PROMPT_TEMPLATES = [
  {
    label: 'Post social content for active Pro tenants',
    prompt: 'Find all active Pro plan tenants, then for each one post a promotional message to their connected social platforms highlighting their restaurant and today\'s specials.',
  },
  {
    label: 'Weekly platform analytics summary',
    prompt: 'Get platform analytics including total tenants, MRR, and new signups from the past 7 days. Summarize the findings and note any notable trends.',
  },
  {
    label: 'Check and activate pending phone agents',
    prompt: 'List all active tenants on Pro plan that have the phone_agent feature enabled. For each, check their phone agent status and activate it if it is currently inactive.',
  },
  {
    label: 'Record SaaS revenue entry',
    prompt: 'Get platform analytics to calculate estimated MRR. Record an income accounting entry for the total estimated monthly revenue.',
  },
]

function StatusDot({ status }: { status: 'running' | 'success' | 'failed' }) {
  const colors = { running: 'bg-yellow-400 animate-pulse', success: 'bg-emerald-400', failed: 'bg-red-400' }
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status]}`} />
}

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function AdminAutomationsPage() {
  const [tasks,        setTasks]        = useState<ScheduledTask[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [creating,     setCreating]     = useState(false)
  const [runningId,    setRunningId]    = useState<number | null>(null)
  const [expandedId,   setExpandedId]   = useState<number | null>(null)
  const [runs,         setRuns]         = useState<Record<number, ScheduledTaskRun[]>>({})
  const [showForm,     setShowForm]     = useState(false)

  const [label,       setLabel]       = useState('')
  const [prompt,      setPrompt]      = useState('')
  const [schedType,   setSchedType]   = useState<'cron' | 'once'>('cron')
  const [cronExpr,    setCronExpr]    = useState('0 9 * * *')
  const [runAt,       setRunAt]       = useState('')

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const data = await api.tasks.adminList()
      setTasks(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function create() {
    if (!label.trim() || !prompt.trim()) return
    setCreating(true)
    try {
      const body: Parameters<typeof api.tasks.adminCreate>[0] = {
        label: label.trim(),
        prompt: prompt.trim(),
        schedule_type: schedType,
        ...(schedType === 'cron' ? { cron_expression: cronExpr } : { run_at: runAt }),
      }
      await api.tasks.adminCreate(body)
      setLabel(''); setPrompt(''); setCronExpr('0 9 * * *'); setRunAt(''); setShowForm(false)
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  async function toggle(id: number) {
    await api.tasks.adminToggle(id)
    await load()
  }

  async function remove(id: number) {
    if (!confirm('Delete this automation task?')) return
    await api.tasks.adminDelete(id)
    await load()
  }

  async function runNow(id: number) {
    setRunningId(id)
    try {
      await api.tasks.adminRunNow(id)
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRunningId(null)
    }
  }

  async function toggleExpand(id: number) {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    if (!runs[id]) {
      try {
        const r = await api.tasks.adminRuns(id)
        setRuns(prev => ({ ...prev, [id]: r }))
      } catch {
        // ignore
      }
    }
  }

  const activeTasks   = tasks.filter(t => t.is_active)
  const inactiveTasks = tasks.filter(t => !t.is_active)

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Platform Automations</h1>
          <p className="text-slate-400 text-sm mt-1">Schedule recurring AI tasks that run automatically across all restaurants.</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {showForm ? 'Cancel' : '+ New Task'}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-300 hover:text-white">✕</button>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6 space-y-5">
          <h2 className="text-base font-semibold text-white">New Platform Automation</h2>

          {/* Templates */}
          <div>
            <p className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wider">Quick templates</p>
            <div className="grid grid-cols-1 gap-2">
              {PROMPT_TEMPLATES.map(t => (
                <button
                  key={t.label}
                  onClick={() => { setLabel(t.label); setPrompt(t.prompt) }}
                  className="text-left px-3 py-2 rounded-lg text-xs text-slate-300 bg-slate-700/40 hover:bg-slate-700 border border-slate-600/40 hover:border-slate-500 transition-all"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 font-medium">Task name</label>
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Weekly social post for Pro tenants"
              className="mt-1 w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 font-medium">Instruction (what the AI will do)</label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              rows={4}
              placeholder="Describe the task in plain language..."
              className="mt-1 w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="sched" checked={schedType === 'cron'} onChange={() => setSchedType('cron')} className="accent-blue-500" />
              <span className="text-sm text-slate-300">Recurring (cron)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="sched" checked={schedType === 'once'} onChange={() => setSchedType('once')} className="accent-blue-500" />
              <span className="text-sm text-slate-300">One-time</span>
            </label>
          </div>

          {schedType === 'cron' && (
            <div>
              <label className="text-xs text-slate-400 font-medium">Schedule</label>
              <div className="flex flex-wrap gap-2 mt-1 mb-2">
                {COMMON_SCHEDULES.map(s => (
                  <button
                    key={s.cron}
                    onClick={() => setCronExpr(s.cron)}
                    className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${cronExpr === s.cron ? 'bg-blue-600/30 border-blue-500 text-blue-300' : 'border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300'}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <input
                value={cronExpr}
                onChange={e => setCronExpr(e.target.value)}
                placeholder="0 9 * * *"
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              <p className="text-xs text-slate-500 mt-1">5-field cron: minute hour day month weekday</p>
            </div>
          )}

          {schedType === 'once' && (
            <div>
              <label className="text-xs text-slate-400 font-medium">Run at (UTC)</label>
              <input
                type="datetime-local"
                value={runAt}
                onChange={e => setRunAt(e.target.value)}
                className="mt-1 w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          )}

          <button
            onClick={create}
            disabled={creating || !label.trim() || !prompt.trim()}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {creating ? 'Scheduling...' : 'Schedule Task'}
          </button>
        </div>
      )}

      {/* Task list */}
      {loading ? (
        <div className="text-center py-16 text-slate-500">Loading automations...</div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <p className="text-slate-400 font-medium">No platform automations yet</p>
          <p className="text-slate-500 text-sm max-w-sm mx-auto">Create a task or ask the Admin AI: "Schedule a weekly social post for all Pro tenants"</p>
          <button onClick={() => setShowForm(true)} className="mt-2 px-4 py-2 bg-blue-600/20 border border-blue-500/30 text-blue-400 rounded-lg text-sm hover:bg-blue-600/30 transition-colors">
            Create first automation
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {activeTasks.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Active ({activeTasks.length})</h2>
              <div className="space-y-3">
                {activeTasks.map(task => <TaskCard key={task.id} task={task} onToggle={toggle} onDelete={remove} onRunNow={runNow} onExpand={toggleExpand} expandedId={expandedId} runs={runs[task.id] || []} running={runningId === task.id} />)}
              </div>
            </section>
          )}
          {inactiveTasks.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Inactive ({inactiveTasks.length})</h2>
              <div className="space-y-3">
                {inactiveTasks.map(task => <TaskCard key={task.id} task={task} onToggle={toggle} onDelete={remove} onRunNow={runNow} onExpand={toggleExpand} expandedId={expandedId} runs={runs[task.id] || []} running={runningId === task.id} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function TaskCard({
  task, onToggle, onDelete, onRunNow, onExpand, expandedId, runs, running,
}: {
  task: ScheduledTask
  onToggle: (id: number) => void
  onDelete: (id: number) => void
  onRunNow: (id: number) => void
  onExpand: (id: number) => void
  expandedId: number | null
  runs: ScheduledTaskRun[]
  running: boolean
}) {
  const isExpanded = expandedId === task.id
  const lastRun = task.last_run

  return (
    <div className={`bg-slate-800/50 border rounded-xl transition-all ${task.is_active ? 'border-slate-700' : 'border-slate-800 opacity-60'}`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Toggle */}
          <button
            onClick={() => onToggle(task.id)}
            className={`mt-0.5 w-9 h-5 rounded-full transition-colors shrink-0 relative ${task.is_active ? 'bg-blue-600' : 'bg-slate-600'}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${task.is_active ? 'left-4' : 'left-0.5'}`} />
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-white text-sm">{task.label}</p>
              {task.schedule_type === 'cron' && task.cron_expression && (
                <code className="text-[11px] bg-slate-900 text-slate-400 border border-slate-700 rounded px-1.5 py-0.5 font-mono">{task.cron_expression}</code>
              )}
              {task.schedule_type === 'once' && <span className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5">one-time</span>}
            </div>

            <p className="text-xs text-slate-400 mt-1 line-clamp-2">{task.prompt}</p>

            <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-500">
              {task.next_run_at && <span>Next: {fmtDate(task.next_run_at)}</span>}
              {lastRun && (
                <span className="flex items-center gap-1.5">
                  <StatusDot status={lastRun.status as 'running' | 'success' | 'failed'} />
                  Last: {fmtDate(lastRun.started_at as string)}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onRunNow(task.id)}
              disabled={running}
              title="Run now"
              className="px-3 py-1.5 text-xs text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-lg border border-slate-600 transition-colors disabled:opacity-40"
            >
              {running ? '...' : 'Run now'}
            </button>
            <button
              onClick={() => onExpand(task.id)}
              className="px-2 py-1.5 text-xs text-slate-500 hover:text-slate-300 rounded-lg hover:bg-slate-700 transition-colors"
            >
              {isExpanded ? '▲' : '▼'}
            </button>
            <button
              onClick={() => onDelete(task.id)}
              className="px-2 py-1.5 text-xs text-slate-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      </div>

      {/* Run history */}
      {isExpanded && (
        <div className="border-t border-slate-700/60 px-4 py-3 space-y-2">
          <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">Run history</p>
          {runs.length === 0 ? (
            <p className="text-xs text-slate-500 italic">No runs yet.</p>
          ) : (
            runs.map(run => (
              <div key={run.id} className="flex items-start gap-2 text-xs">
                <StatusDot status={run.status as 'running' | 'success' | 'failed'} />
                <div className="flex-1 min-w-0">
                  <span className="text-slate-400">{fmtDate(run.started_at)}</span>
                  {run.result_summary && (
                    <p className="text-slate-400 mt-0.5 text-[11px] line-clamp-2">{run.result_summary}</p>
                  )}
                </div>
                <span className={`text-[11px] font-medium shrink-0 ${run.status === 'success' ? 'text-emerald-400' : run.status === 'failed' ? 'text-red-400' : 'text-yellow-400'}`}>
                  {run.status}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
