'use client'
import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { api, MenuItem } from '@/lib/api'

const CATEGORIES = ['appetizers', 'burgers', 'pizza', 'pasta', 'salads', 'sides', 'drinks', 'desserts', 'other']

interface ItemFormData {
  name: string
  category: string
  price: string
  description: string
}

const emptyForm: ItemFormData = { name: '', category: 'other', price: '', description: '' }

export default function MenuPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = use(params)
  const id = parseInt(tenantId)

  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<MenuItem | null>(null)
  const [form, setForm] = useState<ItemFormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.menu.list(id)
      .then(setItems)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  function openAdd() {
    setEditItem(null)
    setForm(emptyForm)
    setShowForm(true)
    setError('')
  }

  function openEdit(item: MenuItem) {
    setEditItem(item)
    setForm({ name: item.name, category: item.category, price: String(item.price), description: item.description ?? '' })
    setShowForm(true)
    setError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const price = parseFloat(form.price)
    if (isNaN(price) || price < 0) { setError('Invalid price'); setSaving(false); return }
    try {
      if (editItem) {
        const updated = await api.menu.update(id, editItem.id, {
          name: form.name, category: form.category, price,
          description: form.description || null, available: editItem.available,
        })
        setItems(prev => prev.map(i => i.id === editItem.id ? updated : i))
      } else {
        const created = await api.menu.add(id, {
          name: form.name, category: form.category, price,
          description: form.description || undefined,
        })
        setItems(prev => [...prev, created])
      }
      setShowForm(false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function toggleAvailable(item: MenuItem) {
    try {
      const updated = await api.menu.update(id, item.id, {
        name: item.name, category: item.category, price: item.price,
        description: item.description, available: !item.available,
      })
      setItems(prev => prev.map(i => i.id === item.id ? updated : i))
    } catch { /* ignore */ }
  }

  async function deleteItem(item: MenuItem) {
    if (!confirm(`Delete "${item.name}"?`)) return
    await api.menu.delete(id, item.id)
    setItems(prev => prev.filter(i => i.id !== item.id))
  }

  const byCategory = items.reduce<Record<string, MenuItem[]>>((acc, item) => {
    const cat = item.category || 'other'
    acc[cat] = [...(acc[cat] || []), item]
    return acc
  }, {})

  return (
    <div className="p-8 max-w-4xl">
      <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">← Dashboard</Link>
      <div className="flex items-center justify-between mt-3 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Menu</h1>
          <p className="text-sm text-gray-400 mt-0.5">{items.length} items · tenant #{id}</p>
        </div>
        <button
          onClick={openAdd}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Add Item
        </button>
      </div>

      {/* Add/Edit form */}
      {showForm && (
        <div className="mb-6 bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">{editItem ? 'Edit Item' : 'New Item'}</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                required
                autoFocus
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Classic Burger"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
              <select
                value={form.category}
                onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Price ($) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.price}
                onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="12.99"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <input
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Optional description"
              />
            </div>
            {error && (
              <p className="col-span-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}
            <div className="col-span-2 flex gap-3 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {saving ? 'Saving…' : editItem ? 'Save Changes' : 'Add Item'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading && <p className="text-sm text-gray-400">Loading menu…</p>}

      {!loading && items.length === 0 && (
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-200">
          <p className="text-gray-500 text-sm">No menu items yet.</p>
          <button onClick={openAdd} className="text-blue-600 text-sm mt-2 hover:underline">Add your first item →</button>
        </div>
      )}

      {/* Items by category */}
      <div className="space-y-6">
        {Object.entries(byCategory).map(([cat, catItems]) => (
          <div key={cat}>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 capitalize">{cat}</h2>
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {catItems.map(item => (
                <div key={item.id} className={`flex items-center justify-between px-5 py-3 gap-4 ${!item.available ? 'opacity-50' : ''}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-gray-900">{item.name}</span>
                      {!item.available && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Off menu</span>
                      )}
                    </div>
                    {item.description && <p className="text-xs text-gray-400 mt-0.5 truncate">{item.description}</p>}
                  </div>
                  <span className="text-sm font-semibold text-gray-900 shrink-0">${item.price.toFixed(2)}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggleAvailable(item)}
                      className="text-xs text-gray-400 hover:text-gray-700"
                      title={item.available ? 'Mark unavailable' : 'Mark available'}
                    >
                      {item.available ? '●' : '○'}
                    </button>
                    <button onClick={() => openEdit(item)} className="text-xs text-blue-600 hover:underline">Edit</button>
                    <button onClick={() => deleteItem(item)} className="text-xs text-gray-400 hover:text-red-500">Del</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
