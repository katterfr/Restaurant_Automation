'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'

export default function NewTenantPage() {
  const router = useRouter()
  const [form, setForm] = useState({ name: '', slug: '', plan: 'starter' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await api.tenants.create(form)
      router.push('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create tenant')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-lg">
      <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">← Back to Dashboard</Link>
      <h1 className="text-2xl font-bold text-gray-900 mt-3 mb-6">Add Tenant</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Restaurant Name</label>
          <input
            type="text"
            value={form.name}
            onChange={e => set('name', e.target.value)}
            required
            autoFocus
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Bella Italia"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Slug</label>
          <input
            type="text"
            value={form.slug}
            onChange={e => set('slug', e.target.value.toLowerCase().replace(/\s+/g, '-'))}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="bella-italia"
          />
          <p className="text-xs text-gray-400 mt-1">Unique URL-friendly identifier</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Plan</label>
          <select
            value={form.plan}
            onChange={e => set('plan', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="starter">Starter — $49/mo</option>
            <option value="pro">Pro — $99/mo</option>
            <option value="enterprise">Enterprise — $249/mo</option>
          </select>
        </div>
        {error && (
          <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          {loading ? 'Creating…' : 'Create Tenant'}
        </button>
      </form>
    </div>
  )
}
