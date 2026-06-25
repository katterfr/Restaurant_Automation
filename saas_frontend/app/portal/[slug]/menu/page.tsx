'use client'
import { useEffect, useState, useCallback } from 'react'
import { api, MenuItem } from '@/lib/api'

const CATEGORIES = ['Appetizers', 'Soups & Salads', 'Mains', 'Burgers & Sandwiches', 'Pizza', 'Pasta', 'Sides', 'Desserts', 'Drinks', 'Specials', 'Other']

function fmt(n: number) { return `$${n.toFixed(2)}` }

interface EditState { name: string; category: string; price: string; description: string; available: boolean }

function blankEdit(): EditState { return { name: '', category: CATEGORIES[2], price: '', description: '', available: true } }
function fromItem(item: MenuItem): EditState { return { name: item.name, category: item.category, price: String(item.price), description: item.description ?? '', available: item.available } }

export default function MenuPage() {
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<number | 'new' | null>(null)
  const [form, setForm] = useState<EditState>(blankEdit())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const load = useCallback(async () => {
    try { setItems(await api.portal.menu()) }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  function startNew() { setForm(blankEdit()); setFormError(''); setEditingId('new') }
  function startEdit(item: MenuItem) { setForm(fromItem(item)); setFormError(''); setEditingId(item.id) }
  function cancel() { setEditingId(null) }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setFormError('Name is required'); return }
    setSaving(true); setFormError('')
    try {
      const data = { name: form.name, category: form.category, price: parseFloat(form.price), description: form.description || undefined, available: form.available }
      if (editingId === 'new') {
        await api.portal.addMenuItem(data)
      } else {
        await api.portal.updateMenuItem(editingId as number, data)
      }
      setEditingId(null)
      await load()
    } catch (e: unknown) { setFormError(e instanceof Error ? e.message : 'Failed') }
    finally { setSaving(false) }
  }

  async function toggleAvailable(item: MenuItem) {
    await api.portal.updateMenuItem(item.id, { available: !item.available })
    await load()
  }

  async function del(item: MenuItem) {
    if (!confirm(`Delete "${item.name}"?`)) return
    await api.portal.deleteMenuItem(item.id)
    await load()
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent'

  const byCategory = items.reduce<Record<string, MenuItem[]>>((acc, item) => {
    ;(acc[item.category] ||= []).push(item)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Menu Management</h1>
        {editingId === null && (
          <button onClick={startNew} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            + Add Item
          </button>
        )}
      </div>

      {editingId !== null && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">{editingId === 'new' ? 'New Item' : 'Edit Item'}</h3>
          <form onSubmit={save} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Name</label>
                <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="e.g. Grilled Salmon" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Category</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={inputCls}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Price ($)</label>
                <input required type="number" min="0" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} className={inputCls} placeholder="0.00" />
              </div>
              <div className="flex items-end pb-0.5">
                <label className="flex items-center gap-2 cursor-pointer" onClick={() => setForm(f => ({ ...f, available: !f.available }))}>
                  <div className={`w-10 h-5 rounded-full transition-colors relative ${form.available ? 'bg-green-500' : 'bg-gray-300'}`}>
                    <span className={`block w-4 h-4 rounded-full bg-white shadow absolute top-0.5 transition-transform ${form.available ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </div>
                  <span className="text-sm text-gray-600">{form.available ? 'Available' : 'Unavailable'}</span>
                </label>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Description <span className="text-gray-400">(optional)</span></label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={inputCls} placeholder="Ingredients, allergens, special notes…" />
            </div>
            {formError && <p className="text-xs text-red-500">{formError}</p>}
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={saving} className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium">
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={cancel} className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading && <div className="text-sm text-gray-400 py-12 text-center">Loading…</div>}
      {error   && <div className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl p-4">{error}</div>}

      {!loading && !error && items.length === 0 && editingId === null && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <svg className="w-8 h-8 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12"/></svg>
          <p className="text-gray-600 font-medium">No menu items yet</p>
          <p className="text-gray-400 text-sm mt-1">Add your first item to start building your menu.</p>
          <button onClick={startNew} className="inline-block mt-4 text-green-600 hover:underline text-sm font-medium">Add first item →</button>
        </div>
      )}

      {Object.entries(byCategory).map(([cat, catItems]) => (
        <div key={cat} className="space-y-1">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-1">{cat}</h2>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {catItems.map(item => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900">{item.name}</p>
                    {!item.available && <span className="text-xs bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full">Unavailable</span>}
                  </div>
                  {item.description && <p className="text-xs text-gray-400 mt-0.5 truncate">{item.description}</p>}
                </div>
                <p className="text-sm font-semibold text-gray-700 shrink-0">{fmt(item.price)}</p>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => toggleAvailable(item)}
                    className={`w-8 h-4 rounded-full transition-colors relative ${item.available ? 'bg-green-500' : 'bg-gray-300'}`}
                    title={item.available ? 'Mark unavailable' : 'Mark available'}
                  >
                    <span className={`block w-3 h-3 rounded-full bg-white shadow absolute top-0.5 transition-transform ${item.available ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                  <button onClick={() => startEdit(item)} className="text-xs text-gray-400 hover:text-gray-700 px-1.5 py-0.5 hover:bg-gray-100 rounded">Edit</button>
                  <button onClick={() => del(item)} className="text-xs text-gray-300 hover:text-red-500 px-1.5 py-0.5 hover:bg-red-50 rounded">Del</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
