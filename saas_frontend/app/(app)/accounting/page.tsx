'use client'
import { useState, useEffect, useCallback } from 'react'
import { api, AdminTenantAccounting, AccountingEntry } from '@/lib/api'

const INCOME_CATS  = ['Sales', 'Online Orders', 'Catering', 'Delivery Revenue', 'Other Income']
const EXPENSE_CATS = ['Food & Ingredients', 'Labor', 'Rent', 'Utilities', 'Marketing', 'Equipment', 'Insurance', 'Supplies', 'Other Expense']

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function AdminAccountingPage() {
  const [tenants,  setTenants]  = useState<AdminTenantAccounting[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [selected, setSelected] = useState<AdminTenantAccounting | null>(null)
  const [entries,  setEntries]  = useState<AccountingEntry[]>([])
  const [entLoad,  setEntLoad]  = useState(false)
  const [filter,   setFilter]   = useState<'all' | 'income' | 'expense'>('all')
  const [showForm, setShowForm] = useState(false)
  const [saving,   setSaving]   = useState(false)

  // new entry form
  const [nType,  setNType]  = useState('income')
  const [nCat,   setNCat]   = useState('')
  const [nAmt,   setNAmt]   = useState('')
  const [nDesc,  setNDesc]  = useState('')
  const [nDate,  setNDate]  = useState('')

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const data = await api.adminAccounting.overview()
      setTenants(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function selectTenant(t: AdminTenantAccounting) {
    setSelected(t)
    setShowForm(false)
    setEntLoad(true)
    try {
      const data = await api.adminAccounting.entries(t.tenant_id, filter === 'all' ? undefined : filter)
      setEntries(data)
    } catch { setEntries([]) }
    finally  { setEntLoad(false) }
  }

  async function reloadEntries() {
    if (!selected) return
    setEntLoad(true)
    try {
      const data = await api.adminAccounting.entries(selected.tenant_id, filter === 'all' ? undefined : filter)
      setEntries(data)
    } catch { setEntries([]) }
    finally { setEntLoad(false) }
  }

  useEffect(() => { if (selected) reloadEntries() }, [filter]) // eslint-disable-line

  async function addEntry() {
    if (!selected || !nCat || !nAmt || !nDesc) return
    setSaving(true)
    try {
      await api.adminAccounting.create(selected.tenant_id, {
        type: nType, category: nCat, amount: parseFloat(nAmt),
        description: nDesc, date: nDate || undefined,
      })
      setNType('income'); setNCat(''); setNAmt(''); setNDesc(''); setNDate('')
      setShowForm(false)
      await load()
      await reloadEntries()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteEntry(id: number) {
    if (!confirm('Delete this entry?')) return
    try {
      await api.adminAccounting.deleteEntry(id)
      setEntries(prev => prev.filter(e => e.id !== id))
      await load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  // Platform totals
  const totalIncome  = tenants.reduce((s, t) => s + t.income,  0)
  const totalExpense = tenants.reduce((s, t) => s + t.expense, 0)
  const totalNet     = totalIncome - totalExpense

  const cats = nType === 'income' ? INCOME_CATS : EXPENSE_CATS

  return (
    <div className="flex h-full min-h-screen bg-gray-950 text-white">
      {/* Left — tenant list */}
      <div className="w-80 shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-5 border-b border-gray-800">
          <h1 className="text-base font-bold text-white">Platform Accounting</h1>
          <p className="text-xs text-gray-400 mt-0.5">All tenant financials</p>
        </div>

        {/* Platform totals */}
        <div className="px-4 py-3 bg-gray-800/50 border-b border-gray-800 space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Total income</span>
            <span className="text-emerald-400 font-medium">{fmt(totalIncome)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Total expenses</span>
            <span className="text-red-400 font-medium">{fmt(totalExpense)}</span>
          </div>
          <div className="flex justify-between text-xs border-t border-gray-700 pt-1 mt-1">
            <span className="text-gray-300 font-medium">Net profit</span>
            <span className={`font-bold ${totalNet >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(totalNet)}</span>
          </div>
        </div>

        {/* Tenant rows */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-sm text-gray-500">Loading...</div>
          ) : (
            tenants.map(t => (
              <button
                key={t.tenant_id}
                onClick={() => selectTenant(t)}
                className={`w-full text-left px-4 py-3 border-b border-gray-800 transition-colors ${
                  selected?.tenant_id === t.tenant_id ? 'bg-blue-600/20 border-l-2 border-l-blue-500' : 'hover:bg-gray-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white truncate">{t.tenant_name}</span>
                  <span className="text-[11px] text-gray-500 capitalize">{t.plan}</span>
                </div>
                <div className="flex gap-3 mt-1">
                  <span className="text-[11px] text-emerald-400">{fmt(t.income)}</span>
                  <span className="text-[11px] text-red-400">−{fmt(t.expense)}</span>
                  <span className={`text-[11px] font-medium ${t.net >= 0 ? 'text-white' : 'text-red-400'}`}>{fmt(t.net)}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right — detail panel */}
      <div className="flex-1 overflow-y-auto">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 p-8">
            <div className="w-16 h-16 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center text-2xl">$</div>
            <p className="text-gray-300 font-medium">Select a restaurant</p>
            <p className="text-gray-500 text-sm max-w-xs">Click any restaurant on the left to view their income, expenses, and P&L details.</p>
          </div>
        ) : (
          <div className="p-6 space-y-6 max-w-3xl">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">{selected.tenant_name}</h2>
                <p className="text-gray-400 text-sm">{selected.slug} · {selected.plan}</p>
              </div>
              <button
                onClick={() => setShowForm(v => !v)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {showForm ? 'Cancel' : '+ Add Entry'}
              </button>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm">
                {error} <button onClick={() => setError(null)} className="ml-2 text-red-300">✕</button>
              </div>
            )}

            {/* P&L summary cards */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Total Income',   value: selected.income,  color: 'emerald' },
                { label: 'Total Expenses', value: selected.expense, color: 'red'     },
                { label: 'Net Profit',     value: selected.net,     color: selected.net >= 0 ? 'emerald' : 'red' },
              ].map(card => (
                <div key={card.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-xs text-gray-400 mb-1">{card.label}</p>
                  <p className={`text-xl font-bold text-${card.color}-400`}>{fmt(card.value)}</p>
                </div>
              ))}
            </div>

            {/* Add entry form */}
            {showForm && (
              <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-white">New Entry</h3>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={nType === 'income'} onChange={() => { setNType('income'); setNCat('') }} className="accent-emerald-500" />
                    <span className="text-sm text-emerald-400">Income</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={nType === 'expense'} onChange={() => { setNType('expense'); setNCat('') }} className="accent-red-500" />
                    <span className="text-sm text-red-400">Expense</span>
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400">Category</label>
                    <select value={nCat} onChange={e => setNCat(e.target.value)} className="mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                      <option value="">Select...</option>
                      {cats.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Amount ($)</label>
                    <input type="number" step="0.01" min="0" value={nAmt} onChange={e => setNAmt(e.target.value)} placeholder="0.00" className="mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-400">Description</label>
                    <input value={nDesc} onChange={e => setNDesc(e.target.value)} placeholder="Brief description..." className="mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Date (optional)</label>
                    <input type="date" value={nDate} onChange={e => setNDate(e.target.value)} className="mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                  </div>
                </div>
                <button onClick={addEntry} disabled={saving || !nCat || !nAmt || !nDesc} className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors">
                  {saving ? 'Saving...' : 'Add Entry'}
                </button>
              </div>
            )}

            {/* Filter tabs */}
            <div className="flex gap-2">
              {(['all', 'income', 'expense'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${filter === f ? 'bg-blue-600 text-white' : 'text-gray-400 bg-gray-800 hover:text-white'}`}>
                  {f}
                </button>
              ))}
            </div>

            {/* Entry table */}
            {entLoad ? (
              <div className="text-sm text-gray-500 py-4">Loading entries...</div>
            ) : entries.length === 0 ? (
              <div className="text-sm text-gray-500 py-8 text-center">No entries found.</div>
            ) : (
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-800">
                    <tr>
                      {['Date', 'Type', 'Category', 'Description', 'Amount', ''].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs text-gray-400 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {entries.map(e => (
                      <tr key={e.id} className="hover:bg-gray-800/40">
                        <td className="px-4 py-2.5 text-gray-300 text-xs whitespace-nowrap">{fmtDate(e.date)}</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${e.type === 'income' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                            {e.type}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-300 text-xs">{e.category}</td>
                        <td className="px-4 py-2.5 text-gray-300 text-xs max-w-xs truncate">{e.description}</td>
                        <td className={`px-4 py-2.5 text-xs font-semibold ${e.type === 'income' ? 'text-emerald-400' : 'text-red-400'}`}>
                          {e.type === 'income' ? '+' : '−'}{fmt(e.amount)}
                        </td>
                        <td className="px-4 py-2.5">
                          <button onClick={() => deleteEntry(e.id)} className="text-gray-600 hover:text-red-400 text-xs transition-colors">✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
