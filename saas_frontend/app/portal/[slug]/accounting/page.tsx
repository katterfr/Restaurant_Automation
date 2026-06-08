'use client'
import { useEffect, useState, useCallback } from 'react'
import { api, AccountingEntry, AccountingSummary } from '@/lib/api'

const INCOME_CATS = ['Food Sales', 'Beverage Sales', 'Catering', 'Delivery Sales', 'Gift Cards', 'Other Income']
const EXPENSE_CATS = ['Food & Ingredients', 'Beverages', 'Labor', 'Rent & Utilities', 'Equipment', 'Marketing', 'Supplies', 'Other Expense']

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function EntryForm({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<'income' | 'expense'>('income')
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const cats = type === 'income' ? INCOME_CATS : EXPENSE_CATS

  useEffect(() => { setCategory('') }, [type])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      await api.accounting.create({ type, category, amount: parseFloat(amount), description: description || undefined, date })
      setOpen(false); setAmount(''); setDescription(''); onSaved()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed') }
    finally { setSaving(false) }
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent'

  if (!open) return (
    <button onClick={() => setOpen(true)} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
      + Add Entry
    </button>
  )

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">New Entry</h3>
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <div className="flex gap-2">
          {(['income', 'expense'] as const).map(t => (
            <button key={t} type="button" onClick={() => setType(t)}
              className={`flex-1 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${type === t ? (t === 'income' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600') : 'bg-gray-100 text-gray-500'}`}>
              {t}
            </button>
          ))}
        </div>
        <select required value={category} onChange={e => setCategory(e.target.value)} className={inputCls}>
          <option value="">Select category…</option>
          {cats.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Amount ($)</label>
            <input required type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className={inputCls} placeholder="0.00" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Date</label>
            <input required type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
          </div>
        </div>
        <input type="text" value={description} onChange={e => setDescription(e.target.value)} className={inputCls} placeholder="Description (optional)" />
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button type="submit" disabled={saving} className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium">
          {saving ? 'Saving…' : 'Save Entry'}
        </button>
      </form>
    </div>
  )
}

export default function AccountingPage() {
  const [summary, setSummary] = useState<AccountingSummary | null>(null)
  const [entries, setEntries] = useState<AccountingEntry[]>([])
  const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, e] = await Promise.all([api.accounting.summary(), api.accounting.entries()])
      setSummary(s); setEntries(e)
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function deleteEntry(id: number) {
    if (!confirm('Delete this entry?')) return
    await api.accounting.delete(id)
    await load()
  }

  const filtered = filter === 'all' ? entries : entries.filter(e => e.type === filter)

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Accounting & Bookkeeping</h1>

      {loading && <div className="text-sm text-gray-400 py-12 text-center">Loading…</div>}
      {error   && <div className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl p-4">{error}</div>}

      {!loading && summary && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'This Month Income',  value: fmt(summary.month_income),  color: 'text-green-600' },
              { label: 'This Month Expenses', value: fmt(summary.month_expense), color: 'text-red-500' },
              { label: 'This Month Profit',   value: fmt(summary.month_profit),  color: summary.month_profit >= 0 ? 'text-green-700' : 'text-red-600' },
            ].map(c => (
              <div key={c.label} className="bg-white rounded-xl border border-gray-200 px-4 py-4 text-center">
                <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{c.label}</p>
              </div>
            ))}
          </div>

          {/* Expense breakdown */}
          {Object.keys(summary.expense_by_category).length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Expenses by Category</h2>
              <div className="space-y-2">
                {Object.entries(summary.expense_by_category).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => {
                  const pct = summary.total_expense ? (amt / summary.total_expense) * 100 : 0
                  return (
                    <div key={cat}>
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <span className="text-gray-600">{cat}</span>
                        <span className="text-gray-900 font-medium">{fmt(amt)}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full"><div className="h-full bg-red-400 rounded-full" style={{ width: `${pct}%` }} /></div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* All-time totals */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'All-Time Income',   value: fmt(summary.total_income),  color: 'text-green-600' },
              { label: 'All-Time Expenses', value: fmt(summary.total_expense), color: 'text-red-500' },
              { label: 'All-Time Profit',   value: fmt(summary.total_profit),  color: summary.total_profit >= 0 ? 'text-green-700' : 'text-red-600' },
            ].map(c => (
              <div key={c.label} className="bg-white rounded-xl border border-gray-100 px-4 py-3 text-center">
                <p className={`text-lg font-semibold ${c.color}`}>{c.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{c.label}</p>
              </div>
            ))}
          </div>

          {/* Entry list */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {(['all', 'income', 'expense'] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`px-3 py-1 rounded-lg text-sm font-medium capitalize transition-colors ${filter === f ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                    {f}
                  </button>
                ))}
              </div>
              <EntryForm onSaved={load} />
            </div>

            {filtered.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400 text-sm">
                No {filter === 'all' ? '' : filter} entries yet.
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                {filtered.map(entry => (
                  <div key={entry.id} className="flex items-center gap-4 px-4 py-3">
                    <div className={`w-2 h-8 rounded-full shrink-0 ${entry.type === 'income' ? 'bg-green-400' : 'bg-red-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{entry.category}</p>
                      {entry.description && <p className="text-xs text-gray-400 truncate">{entry.description}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-semibold ${entry.type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
                        {entry.type === 'income' ? '+' : '-'}{fmt(entry.amount)}
                      </p>
                      <p className="text-xs text-gray-400">{entry.date}</p>
                    </div>
                    <button onClick={() => deleteEntry(entry.id)} className="text-gray-300 hover:text-red-400 transition-colors text-sm shrink-0">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
