'use client'
import { useState, useEffect, useCallback } from 'react'
import { api, ScheduledTask, ScheduledTaskRun } from '@/lib/api'

const COMMON_SCHEDULES = [
  { label: 'Every day at 9am',     cron: '0 9 * * *' },
  { label: 'Every day at 12pm',    cron: '0 12 * * *' },
  { label: 'Every day at 5pm',     cron: '0 17 * * *' },
  { label: 'Weekdays at 9am',      cron: '0 9 * * 1-5' },
  { label: 'Weekdays at 11am',     cron: '0 11 * * 1-5' },
  { label: 'Every Monday at 8am',  cron: '0 8 * * 1' },
  { label: 'Every Friday at 3pm',  cron: '0 15 * * 5' },
  { label: 'Every hour',           cron: '0 * * * *' },
  { label: 'Every 30 minutes',     cron: '*/30 * * * *' },
  { label: 'Custom cron…',         cron: '' },
]

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
  'UTC',
]

const PROMPT_TEMPLATES = [
  { label: 'Daily social post about specials', prompt: 'Check the current menu, then write and publish a compelling post about today\'s specials to all connected social media platforms.' },
  { label: 'Weekly revenue summary post', prompt: 'Look up this week\'s orders and revenue, then post a brief business update to Instagram celebrating the week\'s performance.' },
  { label: 'Lunch ad campaign (weekdays)', prompt: 'Launch a $10/day Meta ad campaign promoting our lunch menu. Write an attention-grabbing headline and body copy, target local audience.' },
  { label: 'Record daily sales income', prompt: 'Look up today\'s total order revenue and create an accounting income entry under the "Sales" category for today\'s amount.' },
  { label: 'Enable weekend specials menu', prompt: 'Enable all menu items in the "Weekend Specials" category so they appear available to customers.' },
  { label: 'Disable weekend specials menu', prompt: 'Disable all menu items in the "Weekend Specials" category until next weekend.' },
]

function formatDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function cronHuman(expr: string | null) {
  if (!expr) return ''
  const match = COMMON_SCHEDULES.find(s => s.cron === expr && s.cron)
  return match ? match.label : expr
}

function ActionBadge({ type }: { type: string | null }) {
  if (!type) return null
  const map: Record<string, { label: string; cls: string }> = {
    social_post:      { label: 'Social Post',    cls: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
    ad_campaign:      { label: 'Ad Campaign',    cls: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
    menu_item_added:  { label: 'Menu Added',     cls: 'bg-green-500/15 text-green-300 border-green-500/30' },
    menu_toggled:     { label: 'Menu Updated',   cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
    accounting_entry: { label: 'Accounting',     cls: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30' },
    order_updated:    { label: 'Order Updated',  cls: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
  }
  const b = map[type]
  if (!b) return <span className={`text-xs px-2 py-0.5 rounded border ${map.social_post.cls}`}>{type}</span>
  return <span className={`text-xs px-2 py-0.5 rounded border ${b.cls}`}>{b.label}</span>
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [runningId, setRunningId] = useState<number | null>(null)
  const [runResult, setRunResult] = useState<{ taskId: number; summary: string; status: string } | null>(null)
  const [expandedRuns, setExpandedRuns] = useState<number | null>(null)
  const [taskRuns, setTaskRuns] = useState<Record<number, ScheduledTaskRun[]>>({})

  // Form state
  const [form, setForm] = useState({
    label: '',
    prompt: '',
    scheduleType: 'cron' as 'cron' | 'once',
    cronPreset: '0 9 * * *',
    cronCustom: '',
    runAt: '',
    timezone: 'America/New_York',
  })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const data = await api.tasks.list()
      setTasks(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCreate() {
    if (!form.label.trim() || !form.prompt.trim()) {
      setFormError('Label and prompt are required.')
      return
    }
    const cronExpr = form.cronPreset === '' ? form.cronCustom : form.cronPreset
    if (form.scheduleType === 'cron' && !cronExpr.trim()) {
      setFormError('A cron expression is required for recurring tasks.')
      return
    }
    if (form.scheduleType === 'once' && !form.runAt.trim()) {
      setFormError('A run date/time is required for one-time tasks.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await api.tasks.create({
        label: form.label.trim(),
        prompt: form.prompt.trim(),
        schedule_type: form.scheduleType,
        cron_expression: form.scheduleType === 'cron' ? cronExpr.trim() : undefined,
        run_at: form.scheduleType === 'once' ? form.runAt : undefined,
        timezone: form.timezone,
      })
      setForm({ label: '', prompt: '', scheduleType: 'cron', cronPreset: '0 9 * * *', cronCustom: '', runAt: '', timezone: 'America/New_York' })
      setShowCreate(false)
      await load()
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Failed to create task')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this scheduled task?')) return
    try {
      await api.tasks.delete(id)
      setTasks(prev => prev.filter(t => t.id !== id))
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  async function handleToggle(id: number) {
    try {
      const res = await api.tasks.toggle(id)
      setTasks(prev => prev.map(t => t.id === id ? { ...t, is_active: res.is_active } : t))
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Toggle failed')
    }
  }

  async function handleRunNow(task: ScheduledTask) {
    setRunningId(task.id)
    setRunResult(null)
    try {
      const res = await api.tasks.runNow(task.id)
      setRunResult({ taskId: task.id, summary: res.summary, status: res.status })
      await load()
    } catch (e: unknown) {
      setRunResult({ taskId: task.id, summary: e instanceof Error ? e.message : 'Run failed', status: 'failed' })
    } finally {
      setRunningId(null)
    }
  }

  async function handleExpandRuns(taskId: number) {
    if (expandedRuns === taskId) { setExpandedRuns(null); return }
    setExpandedRuns(taskId)
    if (!taskRuns[taskId]) {
      try {
        const runs = await api.tasks.runs(taskId)
        setTaskRuns(prev => ({ ...prev, [taskId]: runs }))
      } catch {}
    }
  }

  const cronExpr = form.cronPreset === '' ? form.cronCustom : form.cronPreset

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-[#94a3b8]">
        <div className="w-5 h-5 border-2 border-[#334155] border-t-[#38bdf8] rounded-full animate-spin mr-3" />
        Loading automations…
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">AI Automations</h1>
          <p className="text-[#94a3b8] text-sm mt-1">
            Tell Joyce what to do and when — she executes automatically, even when you&apos;re away.
          </p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setFormError(null) }}
          className="shrink-0 bg-[#38bdf8] hover:bg-[#0ea5e9] text-[#0f172a] font-semibold text-sm px-4 py-2 rounded-xl transition-colors"
        >
          + New Automation
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">{error}</div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="bg-[#1e293b] border border-[#334155] rounded-2xl p-6 space-y-5">
          <h2 className="text-white font-semibold text-lg">New Automation</h2>

          {/* Prompt templates */}
          <div>
            <p className="text-[#94a3b8] text-xs font-medium uppercase tracking-wider mb-2">Quick templates</p>
            <div className="flex flex-wrap gap-2">
              {PROMPT_TEMPLATES.map(t => (
                <button
                  key={t.label}
                  onClick={() => setForm(f => ({ ...f, label: t.label, prompt: t.prompt }))}
                  className="text-xs bg-[#0f172a] hover:bg-[#334155] text-[#94a3b8] hover:text-white border border-[#334155] px-3 py-1.5 rounded-full transition-colors"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {/* Label */}
            <div>
              <label className="text-[#94a3b8] text-xs font-medium block mb-1.5">Task name</label>
              <input
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Daily Instagram special post"
                className="w-full bg-[#0f172a] border border-[#334155] rounded-xl px-3 py-2.5 text-sm text-white placeholder-[#475569] focus:outline-none focus:border-[#38bdf8]"
              />
            </div>

            {/* Prompt */}
            <div>
              <label className="text-[#94a3b8] text-xs font-medium block mb-1.5">What should Joyce do?</label>
              <textarea
                value={form.prompt}
                onChange={e => setForm(f => ({ ...f, prompt: e.target.value }))}
                placeholder="Write the instruction as a command — e.g. 'Check today's menu and post about our lunch specials to Instagram with a compelling caption.'"
                rows={4}
                className="w-full bg-[#0f172a] border border-[#334155] rounded-xl px-3 py-2.5 text-sm text-white placeholder-[#475569] focus:outline-none focus:border-[#38bdf8] resize-none"
              />
              <p className="text-[#475569] text-xs mt-1.5">Be specific — Joyce will follow this exactly at the scheduled time.</p>
            </div>

            {/* Schedule type */}
            <div>
              <label className="text-[#94a3b8] text-xs font-medium block mb-1.5">Schedule type</label>
              <div className="flex gap-3">
                {(['cron', 'once'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setForm(f => ({ ...f, scheduleType: t }))}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                      form.scheduleType === t
                        ? 'bg-[#38bdf8] text-[#0f172a] border-transparent'
                        : 'bg-[#0f172a] text-[#94a3b8] border-[#334155] hover:border-[#38bdf8]'
                    }`}
                  >
                    {t === 'cron' ? 'Recurring' : 'One-time'}
                  </button>
                ))}
              </div>
            </div>

            {/* Recurring: cron */}
            {form.scheduleType === 'cron' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#94a3b8] text-xs font-medium block mb-1.5">Frequency</label>
                  <select
                    value={form.cronPreset}
                    onChange={e => setForm(f => ({ ...f, cronPreset: e.target.value }))}
                    className="w-full bg-[#0f172a] border border-[#334155] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#38bdf8]"
                  >
                    {COMMON_SCHEDULES.map(s => (
                      <option key={s.label} value={s.cron}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[#94a3b8] text-xs font-medium block mb-1.5">Timezone</label>
                  <select
                    value={form.timezone}
                    onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))}
                    className="w-full bg-[#0f172a] border border-[#334155] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#38bdf8]"
                  >
                    {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                </div>
                {form.cronPreset === '' && (
                  <div className="col-span-2">
                    <label className="text-[#94a3b8] text-xs font-medium block mb-1.5">Custom cron expression</label>
                    <input
                      value={form.cronCustom}
                      onChange={e => setForm(f => ({ ...f, cronCustom: e.target.value }))}
                      placeholder="e.g. 0 9 * * 1-5"
                      className="w-full bg-[#0f172a] border border-[#334155] rounded-xl px-3 py-2.5 text-sm text-white placeholder-[#475569] font-mono focus:outline-none focus:border-[#38bdf8]"
                    />
                  </div>
                )}
              </div>
            )}

            {/* One-time: run_at */}
            {form.scheduleType === 'once' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#94a3b8] text-xs font-medium block mb-1.5">Run at</label>
                  <input
                    type="datetime-local"
                    value={form.runAt}
                    onChange={e => setForm(f => ({ ...f, runAt: e.target.value }))}
                    className="w-full bg-[#0f172a] border border-[#334155] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#38bdf8]"
                  />
                </div>
                <div>
                  <label className="text-[#94a3b8] text-xs font-medium block mb-1.5">Timezone</label>
                  <select
                    value={form.timezone}
                    onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))}
                    className="w-full bg-[#0f172a] border border-[#334155] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#38bdf8]"
                  >
                    {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          {formError && (
            <p className="text-red-400 text-sm">{formError}</p>
          )}

          {/* Summary preview */}
          {form.label && form.prompt && (
            <div className="bg-[#0f172a] border border-[#38bdf8]/30 rounded-xl p-4">
              <p className="text-[#38bdf8] text-xs font-semibold uppercase tracking-wider mb-2">Preview</p>
              <p className="text-white text-sm font-medium">{form.label}</p>
              <p className="text-[#94a3b8] text-xs mt-1 leading-relaxed">{form.prompt}</p>
              {form.scheduleType === 'cron' && cronExpr && (
                <p className="text-[#38bdf8] text-xs mt-2 font-mono">{cronExpr} ({form.timezone})</p>
              )}
              {form.scheduleType === 'once' && form.runAt && (
                <p className="text-[#38bdf8] text-xs mt-2">Runs once: {new Date(form.runAt).toLocaleString()}</p>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleCreate}
              disabled={saving}
              className="flex-1 bg-[#38bdf8] hover:bg-[#0ea5e9] disabled:opacity-50 text-[#0f172a] font-semibold text-sm py-2.5 rounded-xl transition-colors"
            >
              {saving ? 'Scheduling…' : 'Schedule Automation'}
            </button>
            <button
              onClick={() => { setShowCreate(false); setFormError(null) }}
              className="px-5 bg-[#0f172a] text-[#94a3b8] hover:text-white border border-[#334155] text-sm font-medium rounded-xl transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {tasks.length === 0 && !showCreate && (
        <div className="bg-[#1e293b] border border-[#334155] border-dashed rounded-2xl p-10 text-center">
          <div className="w-14 h-14 bg-[#38bdf8]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7 text-[#38bdf8]">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <p className="text-white font-semibold text-lg">No automations yet</p>
          <p className="text-[#94a3b8] text-sm mt-1 mb-6 max-w-sm mx-auto">
            Create your first automation and Joyce will execute it automatically — posting to social, running ads, updating your menu, or recording accounting entries.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-[#38bdf8] hover:bg-[#0ea5e9] text-[#0f172a] font-semibold text-sm px-6 py-2.5 rounded-xl transition-colors"
          >
            Create first automation
          </button>
          <div className="mt-8 text-left max-w-md mx-auto">
            <p className="text-[#475569] text-xs font-medium uppercase tracking-wider mb-3">Or just tell Joyce in chat:</p>
            <div className="space-y-2">
              {[
                '"Post our daily specials to Instagram every morning at 9am"',
                '"Run a $10 lunch ad on Meta every weekday at 11am"',
                '"Record today\'s sales to accounting every night at midnight"',
              ].map(ex => (
                <p key={ex} className="text-[#64748b] text-xs font-mono bg-[#0f172a] rounded-lg px-3 py-2 border border-[#334155]">{ex}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Task list */}
      {tasks.length > 0 && (
        <div className="space-y-3">
          {tasks.map(task => (
            <div key={task.id} className="bg-[#1e293b] border border-[#334155] rounded-2xl overflow-hidden">
              <div className="p-5">
                <div className="flex items-start gap-4">
                  {/* Active toggle */}
                  <button
                    onClick={() => handleToggle(task.id)}
                    title={task.is_active ? 'Pause automation' : 'Resume automation'}
                    className={`mt-0.5 w-10 h-6 rounded-full transition-colors shrink-0 relative ${task.is_active ? 'bg-[#38bdf8]' : 'bg-[#334155]'}`}
                  >
                    <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${task.is_active ? 'left-5' : 'left-1'}`} />
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-white font-semibold">{task.label}</p>
                      {!task.is_active && (
                        <span className="text-xs bg-[#334155] text-[#64748b] px-2 py-0.5 rounded">Paused</span>
                      )}
                      {task.last_run && <ActionBadge type={task.last_run.action_type} />}
                    </div>
                    <p className="text-[#94a3b8] text-sm mt-1 leading-relaxed line-clamp-2">{task.prompt}</p>

                    <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3">
                      {task.schedule_type === 'cron' && task.cron_expression && (
                        <span className="text-xs text-[#64748b]">
                          <span className="text-[#38bdf8] font-mono">{task.cron_expression}</span>
                          {' '}{cronHuman(task.cron_expression) !== task.cron_expression && `(${cronHuman(task.cron_expression)})`}
                          {' · '}{task.timezone}
                        </span>
                      )}
                      {task.schedule_type === 'once' && (
                        <span className="text-xs text-[#64748b]">One-time · {formatDate(task.run_at)}</span>
                      )}
                      {task.next_run_at && task.is_active && (
                        <span className="text-xs text-[#64748b]">Next: <span className="text-white">{formatDate(task.next_run_at)}</span></span>
                      )}
                      {task.last_run_at && (
                        <span className="text-xs text-[#64748b]">Last run: {formatDate(task.last_run_at)}</span>
                      )}
                    </div>

                    {/* Last run result */}
                    {task.last_run && (
                      <div className={`mt-3 text-xs rounded-lg px-3 py-2 border ${
                        task.last_run.status === 'success'
                          ? 'bg-green-500/10 border-green-500/20 text-green-300'
                          : task.last_run.status === 'failed'
                          ? 'bg-red-500/10 border-red-500/20 text-red-300'
                          : 'bg-[#0f172a] border-[#334155] text-[#94a3b8]'
                      }`}>
                        {task.last_run.status === 'success' ? '✓ ' : task.last_run.status === 'failed' ? '✗ ' : ''}
                        {task.last_run.result_summary || 'No summary'}
                      </div>
                    )}

                    {/* Run result from manual trigger */}
                    {runResult?.taskId === task.id && (
                      <div className={`mt-3 text-xs rounded-lg px-3 py-2 border ${
                        runResult.status === 'success'
                          ? 'bg-green-500/10 border-green-500/20 text-green-300'
                          : 'bg-red-500/10 border-red-500/20 text-red-300'
                      }`}>
                        {runResult.status === 'success' ? '✓ ' : '✗ '}{runResult.summary}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleRunNow(task)}
                      disabled={runningId === task.id}
                      title="Run now"
                      className="text-xs bg-[#0f172a] border border-[#334155] hover:border-[#38bdf8] text-[#94a3b8] hover:text-[#38bdf8] px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 font-medium"
                    >
                      {runningId === task.id ? (
                        <span className="flex items-center gap-1.5">
                          <span className="w-3 h-3 border border-[#38bdf8] border-t-transparent rounded-full animate-spin" />
                          Running…
                        </span>
                      ) : 'Run now'}
                    </button>
                    <button
                      onClick={() => handleExpandRuns(task.id)}
                      title="View run history"
                      className="text-xs bg-[#0f172a] border border-[#334155] hover:border-[#475569] text-[#94a3b8] px-3 py-1.5 rounded-lg transition-colors font-medium"
                    >
                      History
                    </button>
                    <button
                      onClick={() => handleDelete(task.id)}
                      title="Delete"
                      className="w-8 h-8 flex items-center justify-center text-[#475569] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Run history */}
              {expandedRuns === task.id && (
                <div className="border-t border-[#334155] px-5 py-4">
                  <p className="text-[#64748b] text-xs font-medium uppercase tracking-wider mb-3">Run history</p>
                  {!taskRuns[task.id] ? (
                    <p className="text-[#475569] text-sm">Loading…</p>
                  ) : taskRuns[task.id].length === 0 ? (
                    <p className="text-[#475569] text-sm">No runs yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {taskRuns[task.id].map(run => (
                        <div key={run.id} className={`flex items-start gap-3 text-xs rounded-lg px-3 py-2.5 border ${
                          run.status === 'success'
                            ? 'bg-green-500/8 border-green-500/20'
                            : run.status === 'failed'
                            ? 'bg-red-500/8 border-red-500/20'
                            : 'bg-[#0f172a] border-[#334155]'
                        }`}>
                          <span className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                            run.status === 'success' ? 'bg-green-400' : run.status === 'failed' ? 'bg-red-400' : 'bg-yellow-400 animate-pulse'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className={run.status === 'success' ? 'text-green-300' : run.status === 'failed' ? 'text-red-300' : 'text-[#94a3b8]'}>
                                {run.status === 'success' ? 'Success' : run.status === 'failed' ? 'Failed' : 'Running'}
                                {run.action_type && <ActionBadge type={run.action_type} />}
                              </span>
                              <span className="text-[#475569]">{formatDate(run.started_at)}</span>
                            </div>
                            {run.result_summary && (
                              <p className="text-[#94a3b8] mt-1 leading-relaxed">{run.result_summary}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Info footer */}
      <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 text-[#64748b] text-xs leading-relaxed">
        Joyce checks for due automations every 60 seconds. Tasks run in your restaurant&apos;s context — they can post to social media, launch ads, update your menu, and record accounting entries, all without you being logged in. You can also create automations by chatting with Joyce.
      </div>
    </div>
  )
}
