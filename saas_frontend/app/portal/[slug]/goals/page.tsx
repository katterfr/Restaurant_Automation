'use client'
import { useEffect, useState, useCallback, useContext } from 'react'
import { useParams } from 'next/navigation'
import { api, BusinessGoal } from '@/lib/api'
import { getRole } from '@/lib/auth'
import { CustomizationContext } from '../tenant-context'

type Period = 'daily' | 'weekly' | 'monthly' | 'yearly'

const PERIODS: { key: Period; label: string }[] = [
  { key: 'daily',   label: 'Daily' },
  { key: 'weekly',  label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly',  label: 'Yearly' },
]

const METRICS = ['Revenue', 'Orders', 'Customers', 'Calls', 'Custom']

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function periodEnd(period: Period): string {
  const d = new Date()
  if (period === 'daily') return today()
  if (period === 'weekly') {
    d.setDate(d.getDate() + (6 - d.getDay()))
    return d.toISOString().slice(0, 10)
  }
  if (period === 'monthly') {
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
  }
  // yearly
  return `${d.getFullYear()}-12-31`
}

interface GoalFormState {
  title: string
  description: string
  metric: string
  target_value: string
  period: Period
  period_start: string
  period_end: string
}

const emptyForm = (period: Period): GoalFormState => ({
  title: '',
  description: '',
  metric: 'Revenue',
  target_value: '',
  period,
  period_start: today(),
  period_end: periodEnd(period),
})

export default function GoalsPage() {
  useParams<{ slug: string }>()
  const customization = useContext(CustomizationContext)
  const accent = customization.accent_color || '#16a34a'
  const role = getRole()
  const isManager = role === 'owner' || role === 'admin' || role === 'manager'

  const [goals, setGoals] = useState<BusinessGoal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<Period>('daily')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<GoalFormState>(emptyForm('daily'))
  const [submitting, setSubmitting] = useState(false)

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<GoalFormState>(emptyForm('daily'))
  const [editSubmitting, setEditSubmitting] = useState(false)

  const load = useCallback(async () => {
    try {
      const g = await api.staff.getGoals()
      setGoals(g)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load goals')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Keep period_end in sync with period picker
  function setFormPeriod(period: Period) {
    setForm(f => ({ ...f, period, period_end: periodEnd(period) }))
  }

  async function createGoal(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const g = await api.staff.createGoal({
        title: form.title,
        description: form.description || undefined,
        metric: form.metric,
        target_value: parseFloat(form.target_value),
        period: form.period,
        period_start: form.period_start,
        period_end: form.period_end,
        is_active: true,
      })
      setGoals(prev => [g, ...prev])
      setShowForm(false)
      setForm(emptyForm(activeTab))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create goal')
    } finally {
      setSubmitting(false)
    }
  }

  function startEdit(g: BusinessGoal) {
    setEditingId(g.id)
    setEditForm({
      title: g.title,
      description: g.description || '',
      metric: g.metric,
      target_value: String(g.target_value),
      period: g.period as Period,
      period_start: g.period_start,
      period_end: g.period_end,
    })
  }

  async function saveEdit(id: number) {
    setEditSubmitting(true)
    setError('')
    try {
      const updated = await api.staff.updateGoal(id, {
        title: editForm.title,
        description: editForm.description || undefined,
        metric: editForm.metric,
        target_value: parseFloat(editForm.target_value),
        period: editForm.period,
        period_start: editForm.period_start,
        period_end: editForm.period_end,
      })
      setGoals(prev => prev.map(g => g.id === id ? updated : g))
      setEditingId(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setEditSubmitting(false)
    }
  }

  async function deleteGoal(id: number) {
    if (!confirm('Delete this goal?')) return
    try {
      await api.staff.deleteGoal(id)
      setGoals(prev => prev.filter(g => g.id !== id))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete')
    }
  }

  async function updateCurrentValue(id: number, val: string) {
    const num = parseFloat(val)
    if (isNaN(num)) return
    try {
      const updated = await api.staff.updateGoal(id, { current_value: num })
      setGoals(prev => prev.map(g => g.id === id ? updated : g))
    } catch {}
  }

  const tabGoals = goals.filter(g => g.period === activeTab)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-gray-200 rounded-full animate-spin" style={{ borderTopColor: accent }} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Business Goals</h1>
          <p className="text-sm text-gray-500 mt-1">Track your daily, weekly, monthly, and yearly targets</p>
        </div>
        {isManager && (
          <button
            onClick={() => { setShowForm(v => !v); setForm(emptyForm(activeTab)) }}
            className="px-4 py-2 text-white text-sm font-medium rounded-xl hover:opacity-90 transition-opacity"
            style={{ backgroundColor: accent }}
          >
            {showForm ? 'Cancel' : 'Add Goal'}
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Add goal form */}
      {showForm && isManager && (
        <form onSubmit={createGoal} className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-5 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">New Goal</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Title</label>
              <input
                required
                type="text"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                placeholder="e.g. Daily Revenue Target"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Metric</label>
              <select
                value={form.metric}
                onChange={e => setForm(f => ({ ...f, metric: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
              >
                {METRICS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Target Value</label>
              <input
                required
                type="number"
                min="0"
                step="any"
                value={form.target_value}
                onChange={e => setForm(f => ({ ...f, target_value: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                placeholder="1000"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Period</label>
              <select
                value={form.period}
                onChange={e => setFormPeriod(e.target.value as Period)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
              >
                {PERIODS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Period Start</label>
              <input
                required
                type="date"
                value={form.period_start}
                onChange={e => setForm(f => ({ ...f, period_start: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Period End</label>
              <input
                required
                type="date"
                value={form.period_end}
                onChange={e => setForm(f => ({ ...f, period_end: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Description (optional)</label>
              <input
                type="text"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                placeholder="Optional description"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
              style={{ backgroundColor: accent }}
            >
              {submitting ? 'Creating...' : 'Create Goal'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-5 py-2 border border-gray-200 text-sm text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Period tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {PERIODS.map(p => (
          <button
            key={p.key}
            onClick={() => setActiveTab(p.key)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === p.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
            style={activeTab === p.key ? { color: accent } : {}}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Goal cards */}
      {tabGoals.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-12 h-12 bg-gray-100 rounded-2xl mx-auto mb-3 flex items-center justify-center text-gray-400 text-lg font-bold">G</div>
          <p className="text-gray-500 text-sm">No {activeTab} goals yet.</p>
          {isManager && (
            <button
              onClick={() => { setShowForm(true); setForm(emptyForm(activeTab)) }}
              className="mt-3 text-sm font-medium hover:underline"
              style={{ color: accent }}
            >
              Create your first goal
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {tabGoals.map(g => {
            const pct = Math.min(100, g.target_value > 0 ? Math.round((g.current_value / g.target_value) * 100) : 0)
            const isEditing = editingId === g.id

            if (isEditing && isManager) {
              return (
                <div key={g.id} className="bg-white rounded-xl border-2 shadow-sm p-5 space-y-3" style={{ borderColor: accent }}>
                  <input
                    type="text"
                    value={editForm.title}
                    onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Target</label>
                      <input
                        type="number"
                        value={editForm.target_value}
                        onChange={e => setEditForm(f => ({ ...f, target_value: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Metric</label>
                      <select
                        value={editForm.metric}
                        onChange={e => setEditForm(f => ({ ...f, metric: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                      >
                        {METRICS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Start</label>
                      <input
                        type="date"
                        value={editForm.period_start}
                        onChange={e => setEditForm(f => ({ ...f, period_start: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">End</label>
                      <input
                        type="date"
                        value={editForm.period_end}
                        onChange={e => setEditForm(f => ({ ...f, period_end: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEdit(g.id)}
                      disabled={editSubmitting}
                      className="flex-1 py-2 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
                      style={{ backgroundColor: accent }}
                    >
                      {editSubmitting ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-4 py-2 border border-gray-200 text-sm text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )
            }

            return (
              <div key={g.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-gray-900 truncate">{g.title}</h3>
                    {g.description && <p className="text-xs text-gray-500 mt-0.5">{g.description}</p>}
                  </div>
                  {isManager && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => startEdit(g)}
                        className="text-xs text-gray-400 hover:text-gray-700 transition-colors px-2 py-1 rounded hover:bg-gray-100"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteGoal(g.id)}
                        className="text-xs text-red-400 hover:text-red-600 transition-colors px-2 py-1 rounded hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>

                {/* Progress bar */}
                <div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? '#16a34a' : accent }}
                    />
                  </div>
                  <div className="flex justify-between items-center mt-1.5">
                    <p className="text-xs text-gray-500">{g.current_value} / {g.target_value} {g.metric}</p>
                    <p className="text-xs font-semibold" style={{ color: pct >= 100 ? '#16a34a' : accent }}>{pct}%</p>
                  </div>
                </div>

                {/* Current value quick-update (owner only) */}
                {isManager && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500 shrink-0">Update progress:</label>
                    <input
                      type="number"
                      defaultValue={g.current_value}
                      min="0"
                      step="any"
                      onBlur={e => updateCurrentValue(g.id, e.target.value)}
                      className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2"
                    />
                  </div>
                )}

                <p className="text-xs text-gray-400">
                  {formatDate(g.period_start)} &ndash; {formatDate(g.period_end)}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
